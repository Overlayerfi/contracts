import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { swap } from "../scripts/uniswap_swapper/proxy";
import { addLiquidityTriStable } from "../scripts/curve/addLiqTriStable";
import { DAI_ABI } from "../scripts/abi/DAI_abi";
import { USDC_ABI } from "../scripts/abi/USDC_abi";
import { USDT_ABI } from "../scripts/abi/USDT_abi";
import {
  CURVE_DAI_USDC_USDT_LP,
  CURVE_DAI_USDC_USDT_POOL,
  DAI_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS
} from "../scripts/addresses";

// This contract shares the basic staking rewards math with `CurveLiquidity.sol` and hence some tests are being ignored as tested within the other test
describe("CurveStableStake", function () {
  async function deployFixture() {
    const latestTime: number = await time.latest();
    const [owner, alice] = await ethers.getSigners();

    // For localhost
    const block = await owner.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const defaultTransactionOptions = {
      maxFeePerGas: baseFee * BigInt(2)
    };

    const token0 = DAI_ADDRESS;
    const token1 = USDC_ADDRESS;
    const token2 = USDT_ADDRESS;
    const token0Decimals = 18;
    const token1Decimals = 6;
    const token2Decimals = 6;

    const curveContract = await ethers.getContractFactory(
      "CurveLiquidityProxy"
    );
    const curve = await curveContract.deploy(defaultTransactionOptions);
    await curve.waitForDeployment();

    await swap("0.5", "0.1");
    const curveAmount = "10";
    // Transfer funds to curve contract
    const token1Contract = new ethers.Contract(token1, DAI_ABI);
    const token0Contract = new ethers.Contract(token0, USDC_ABI);
    const token2Contract = new ethers.Contract(token2, USDT_ABI);
    await token0Contract
      .connect(owner)
      .transfer(
        await curve.getAddress(),
        ethers.parseUnits(curveAmount, token0Decimals)
      );
    await token1Contract
      .connect(owner)
      .transfer(
        await curve.getAddress(),
        ethers.parseUnits(curveAmount, token1Decimals)
      );
    await token2Contract
      .connect(owner)
      .transfer(
        await curve.getAddress(),
        ethers.parseUnits(curveAmount, token2Decimals)
      );

    await addLiquidityTriStable(
      curve,
      CURVE_DAI_USDC_USDT_POOL,
      CURVE_DAI_USDC_USDT_LP,
      token0,
      token1,
      token2,
      token0Decimals,
      token1Decimals,
      token2Decimals,
      curveAmount,
      curveAmount,
      curveAmount
    );

    const CurveLiquidity = await ethers.getContractFactory("CurveStableStake");
    const curveLiquidity = await CurveLiquidity.deploy(
      owner.getAddress(),
      defaultTransactionOptions
    );
    await curveLiquidity.waitForDeployment();

    const SingleLiquidity = await ethers.getContractFactory(
      "SingleStableStake"
    );
    const singleLiquidity = await SingleLiquidity.deploy(
      owner.getAddress(),
      defaultTransactionOptions
    );
    await singleLiquidity.waitForDeployment();

    const TokenRewardOneOverlayerReferral = await ethers.getContractFactory(
      "OverlayerReferral"
    );
    const tokenRewardOneOverlayerReferral =
      await TokenRewardOneOverlayerReferral.deploy(
        owner.address,
        defaultTransactionOptions
      );
    await tokenRewardOneOverlayerReferral.waitForDeployment();
    await tokenRewardOneOverlayerReferral.setMinter(
      curveLiquidity.getAddress()
    );
    await tokenRewardOneOverlayerReferral.setStakingPools([
      await curveLiquidity.getAddress()
    ]);

    // Set staking pools
    await tokenRewardOneOverlayerReferral.addPointsTracker(
      await curveLiquidity.getAddress()
    );
    await tokenRewardOneOverlayerReferral.addPointsTracker(
      await singleLiquidity.getAddress()
    );
    await tokenRewardOneOverlayerReferral.setStakingPools([
      await curveLiquidity.getAddress(),
      await singleLiquidity.getAddress()
    ]);

    await tokenRewardOneOverlayerReferral
      .connect(owner)
      .setMinter(await curveLiquidity.getAddress());
    await tokenRewardOneOverlayerReferral
      .connect(owner)
      .setMinter(await singleLiquidity.getAddress());

    const stakedAsset = new ethers.Contract(
      CURVE_DAI_USDC_USDT_LP,
      USDC_ABI,
      owner
    );

    await stakedAsset
      .connect(owner)
      .transfer(alice.address, await stakedAsset.balanceOf(owner.address));
    await stakedAsset
      .connect(alice)
      .approve(await curveLiquidity.getAddress(), ethers.MaxUint256);
    await stakedAsset
      .connect(alice)
      .approve(await singleLiquidity.getAddress(), ethers.MaxUint256);

    await singleLiquidity.updateReferral(
      await tokenRewardOneOverlayerReferral.getAddress()
    );
    await curveLiquidity.updateReferral(
      await tokenRewardOneOverlayerReferral.getAddress()
    );

    return {
      curveLiquidity,
      singleLiquidity,
      stakedAsset,
      tokenRewardOneOverlayerReferral,
      latestTime,
      owner,
      alice
    };
  }

  describe("Overlayer Referral System Integration", function () {
    describe("Multi-Pool Referral System", function () {
      it("Should correctly track and distribute rewards across multiple staking pools", async function () {
        const {
          curveLiquidity,
          singleLiquidity,
          stakedAsset,
          tokenRewardOneOverlayerReferral,
          owner,
          alice
        } = await loadFixture(deployFixture);
        await curveLiquidity.setRewardForStakedAssets(
          tokenRewardOneOverlayerReferral.getAddress(),
          100_000,
          1
        );
        await singleLiquidity.setRewardForStakedAssets(
          tokenRewardOneOverlayerReferral.getAddress(),
          200_000,
          1
        );
        await curveLiquidity.addWithNumCoinsAndPool(
          stakedAsset.getAddress(),
          tokenRewardOneOverlayerReferral.getAddress(),
          1,
          3,
          CURVE_DAI_USDC_USDT_POOL,
          0,
          false,
          true
        );
        await singleLiquidity.add(
          stakedAsset.getAddress(),
          tokenRewardOneOverlayerReferral.getAddress(),
          1,
          0,
          false,
          true
        );
        expect(await curveLiquidity.poolLength()).to.equal(1);
        expect(await singleLiquidity.poolLength()).to.equal(1);

        await curveLiquidity.connect(alice).deposit(0, ethers.parseEther("10"));
        await singleLiquidity
          .connect(alice)
          .deposit(0, ethers.parseEther("10"));

        // 1 days
        await time.increase(60 * 60 * 24);

        expect(
          await curveLiquidity.pendingReward(0, alice.address)
        ).to.be.greaterThan(0);
        expect(
          await singleLiquidity.pendingReward(0, alice.address)
        ).to.be.greaterThan(0);

        // ReferralType.Team = 1
        await tokenRewardOneOverlayerReferral
          .connect(owner)
          .addCode("2025", owner.address, 1);
        await tokenRewardOneOverlayerReferral.connect(owner).setTeamOpen(true);
        expect(
          await tokenRewardOneOverlayerReferral.balanceOf(alice.address)
        ).to.be.equal(0);
        await tokenRewardOneOverlayerReferral
          .connect(alice)
          .consumeReferral("2025");

        // By using a referral we harvest all the previous amounts
        expect(
          await curveLiquidity.pendingReward(0, alice.address)
        ).to.be.equal(0);
        expect(
          await singleLiquidity.pendingReward(0, alice.address)
        ).to.be.equal(0);
        expect(
          await tokenRewardOneOverlayerReferral.balanceOf(alice.address)
        ).to.be.greaterThan(0);
        expect(
          +ethers.formatEther(
            await tokenRewardOneOverlayerReferral.codeTotalPoints("2025")
          )
        ).to.be.equal(0);

        await singleLiquidity
          .connect(alice)
          .withdraw(0, ethers.parseEther("10"));
        await singleLiquidity
          .connect(alice)
          .deposit(0, ethers.parseEther("10"));

        const days = 1;
        // 1 days
        await time.increase(60 * 60 * 24 * days);

        await singleLiquidity
          .connect(alice)
          .withdraw(0, ethers.parseEther("10"));
        await curveLiquidity
          .connect(alice)
          .withdraw(0, ethers.parseEther("10"));
        const expectedOne =
          ((0.05 * ((10 * 200_000) / 1)) / (60 * 60 * 24 * 365)) *
          (60 * 60 * 24 * days);
        const expectedTwo =
          ((0.05 * ((10 * 100_000) / 1)) / (60 * 60 * 24 * 365)) *
          (60 * 60 * 24 * days);
        expect(
          +ethers.formatEther(
            await tokenRewardOneOverlayerReferral.codeTotalPoints("2025")
          )
        ).to.be.greaterThan((expectedOne + expectedTwo) * 0.995);
        expect(
          +ethers.formatEther(
            await tokenRewardOneOverlayerReferral.codeTotalPoints("2025")
          )
        ).to.be.lessThan((expectedOne + expectedTwo) * 1.015);
        expect(
          +ethers.formatEther(
            await tokenRewardOneOverlayerReferral.generatedPoints(owner.address)
          )
        ).to.be.greaterThan((expectedOne + expectedTwo) * 0.995);
        expect(
          +ethers.formatEther(
            await tokenRewardOneOverlayerReferral.generatedPoints(owner.address)
          )
        ).to.be.lessThan((expectedOne + expectedTwo) * 1.015);
      });
    });
  });
});
