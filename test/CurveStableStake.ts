import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { swap } from "../scripts/uniswap_swapper/proxy";
import { addLiquidityTriStable } from "../scripts/curve/main";
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

// This contract shares the basic staking rewards math with `Liquidity.sol` and hence some tests are being ignored as tested within the other test
describe("CurveStableStake", function () {
  async function deployFixture() {
    const latestTime: number = await time.latest();
    const [owner, notOwner, alice, bob] = await ethers.getSigners();

    // For localhost
    const block = await owner.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const defaultTransactionOptions = {
      maxFeePerGas: baseFee * BigInt(10)
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

    const Liquidity = await ethers.getContractFactory("CurveStableStake");
    const liquidity = await Liquidity.deploy(
      owner.getAddress(),
      latestTime,
      defaultTransactionOptions
    );
    await liquidity.waitForDeployment();

    const TokenRewardOne = await ethers.getContractFactory("OvaReferral");
    const tokenRewardOneOvaReferral = await TokenRewardOne.deploy(
      owner.address,
      defaultTransactionOptions
    );
    await tokenRewardOneOvaReferral.waitForDeployment();
    await tokenRewardOneOvaReferral.setMinter(liquidity.getAddress());

    const stakedAsset = new ethers.Contract(
      CURVE_DAI_USDC_USDT_LP,
      USDC_ABI,
      owner
    );

    return {
      liquidity,
      stakedAsset,
      tokenRewardOneOvaReferral,
      latestTime,
      owner,
      notOwner,
      alice,
      bob
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner address", async function () {
      const { liquidity, owner } = await loadFixture(deployFixture);
      expect(await liquidity.owner()).to.equal(await owner.getAddress());
    });

    it("Should set the right start timestamp", async function () {
      const { liquidity, latestTime } = await loadFixture(deployFixture);
      expect(await liquidity.startTime()).to.equal(latestTime);
    });
  });

  describe("ModifyParam", function () {
    it("Should update multiplier", async function () {
      const { liquidity, owner } = await loadFixture(deployFixture);
      await liquidity.connect(owner).updateMultiplier(2);
      expect(await liquidity.bonusMultiplier()).to.equal(2);
    });

    it("Should revert update multiplier if not owner", async function () {
      const { liquidity, notOwner } = await loadFixture(deployFixture);
      await expect(liquidity.connect(notOwner).updateMultiplier(2)).to.be
        .eventually.rejected;
    });

    it("Should update starting timestamp", async function () {
      const { liquidity, owner, latestTime } = await loadFixture(deployFixture);
      await liquidity.connect(owner).updateStartTime(latestTime + 100);
      expect(await liquidity.startTime()).to.equal(latestTime + 100);
    });

    it("Should revert update multiplier if not owner", async function () {
      const { liquidity, notOwner } = await loadFixture(deployFixture);
      await expect(liquidity.connect(notOwner).updateStartTime(2)).to.be
        .eventually.rejected;
    });
  });

  describe("GetInfo", function () {
    it("Should get pool length", async function () {
      const { liquidity } = await loadFixture(deployFixture);
      expect(await liquidity.poolLength()).to.equal(0);
    });
  });

  describe("AddPool", function () {
    it("Should not add a new pool if start timestamp for rewards is zero", async function () {
      const { liquidity, stakedAsset, owner, tokenRewardOneOvaReferral } =
        await loadFixture(deployFixture);
      await liquidity.connect(owner).updateStartTime(0);
      await liquidity.setRewardForStakedAssets(
        tokenRewardOneOvaReferral.getAddress(),
        1,
        1
      );
      await expect(
        liquidity.addWithNumCoinsAndPool(
          stakedAsset.getAddress(),
          tokenRewardOneOvaReferral.getAddress(),
          1,
          3,
          CURVE_DAI_USDC_USDT_POOL,
          true
        )
      ).to.be.eventually.rejected;
    });

    it("Should add a new pool", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral } =
        await loadFixture(deployFixture);
      await liquidity.setRewardForStakedAssets(
        tokenRewardOneOvaReferral.getAddress(),
        1,
        1
      );
      await liquidity.addWithNumCoinsAndPool(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        3,
        CURVE_DAI_USDC_USDT_POOL,
        true
      );
      expect(await liquidity.poolLength()).to.equal(1);
    });

    it("Should return correct allocation points for different pools", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral } =
        await loadFixture(deployFixture);
      await liquidity.setRewardForStakedAssets(
        tokenRewardOneOvaReferral.getAddress(),
        1,
        1
      );
      await liquidity.addWithNumCoinsAndPool(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        3,
        CURVE_DAI_USDC_USDT_POOL,
        true
      );
      expect(await liquidity.poolLength()).to.equal(1);
      await liquidity.setRewardForStakedAssets(stakedAsset.getAddress(), 1, 1);
      await liquidity.addWithNumCoinsAndPool(
        tokenRewardOneOvaReferral.getAddress(),
        stakedAsset.getAddress(),
        10,
        3,
        CURVE_DAI_USDC_USDT_POOL,
        true
      );
      expect(await liquidity.poolLength()).to.equal(2);
      expect(
        await liquidity.totalAllocPointsPerReward(
          tokenRewardOneOvaReferral.getAddress()
        )
      ).to.be.equal(1);
      expect(
        await liquidity.totalAllocPointsPerReward(stakedAsset.getAddress())
      ).to.be.equal(10);
    });

    it("Should not add a new pool if not owner", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral, notOwner } =
        await loadFixture(deployFixture);
      await liquidity.setRewardForStakedAssets(
        tokenRewardOneOvaReferral.getAddress(),
        1,
        1
      );
      await expect(
        liquidity
          .connect(notOwner)
          .add(
            stakedAsset.getAddress(),
            tokenRewardOneOvaReferral.getAddress(),
            1,
            false
          )
      ).to.be.eventually.rejected;
    });
  });

  describe("SetReward", function () {
    it("Should set reward", async function () {
      const { liquidity, stakedAsset } = await loadFixture(deployFixture);
      await liquidity.setRewardForStakedAssets(stakedAsset.getAddress(), 1, 1);
      expect(
        await liquidity.activeRewards(stakedAsset.getAddress())
      ).to.be.equal(true);
    });

    it("Should change reward rate", async function () {
      const { liquidity, stakedAsset } = await loadFixture(deployFixture);
      await liquidity.setRewardForStakedAssets(stakedAsset.getAddress(), 1, 1);
      expect(
        await liquidity.activeRewards(stakedAsset.getAddress())
      ).to.be.equal(true);
      expect(
        await liquidity.rewardsPerSecondMultiplierNum(stakedAsset.getAddress())
      ).to.be.equal(1);
      await liquidity.setRewardForStakedAssets(stakedAsset.getAddress(), 10, 1);
      expect(
        await liquidity.rewardsPerSecondMultiplierNum(stakedAsset.getAddress())
      ).to.be.equal(10);
    });

    it("Should not set reward", async function () {
      const { liquidity, stakedAsset, notOwner } = await loadFixture(
        deployFixture
      );
      await expect(
        liquidity
          .connect(notOwner)
          .setRewardForStakedAssets(stakedAsset.getAddress(), 1, 1)
      ).to.be.eventually.rejected;
    });
  });

  describe("CoreFunctionality", function () {
    it("Deposit", async function () {
      const {
        owner,
        liquidity,
        stakedAsset,
        tokenRewardOneOvaReferral,
        alice,
        bob
      } = await loadFixture(deployFixture);

      const latestTime: number = await time.latest();
      await time.increaseTo(latestTime + 1);

      await stakedAsset.transfer(alice.getAddress(), 10);
      await stakedAsset.transfer(bob.getAddress(), 10);

      await stakedAsset.connect(alice).approve(liquidity.getAddress(), 10);
      await stakedAsset.connect(bob).approve(liquidity.getAddress(), 10);

      expect(
        await stakedAsset.allowance(alice.getAddress(), liquidity.getAddress())
      ).to.equal(10);
      expect(
        await stakedAsset.allowance(bob.getAddress(), liquidity.getAddress())
      ).to.equal(10);

      await liquidity.setRewardForStakedAssets(
        tokenRewardOneOvaReferral.getAddress(),
        1,
        1
      );
      await liquidity.addWithNumCoinsAndPool(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        3,
        CURVE_DAI_USDC_USDT_POOL,
        true
      );

      await expect(await liquidity.connect(alice).deposit(0, 5)).to.emit(
        liquidity,
        "Deposit"
      );
      await expect(await liquidity.connect(bob).deposit(0, 5)).to.emit(
        liquidity,
        "Deposit"
      );
    });

    it("Rewards for staked liquidity", async function () {
      const {
        owner,
        liquidity,
        stakedAsset,
        tokenRewardOneOvaReferral,
        alice
      } = await loadFixture(deployFixture);

      // The held liquidity is slight more than 20 as virtual price is > 1.0 but as we use a 5% error in our calculations the results will still be in the range

      await stakedAsset.transfer(alice.getAddress(), ethers.parseEther("20"));
      await stakedAsset
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.MaxUint256);

      await liquidity.setRewardForStakedAssets(
        tokenRewardOneOvaReferral.getAddress(),
        1,
        1
      );
      await liquidity.addWithNumCoinsAndPool(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        3,
        CURVE_DAI_USDC_USDT_POOL,
        true
      );

      await expect(
        await liquidity.connect(alice).deposit(0, ethers.parseEther("1"))
      ).to.emit(liquidity, "Deposit");

      await time.increase(60 * 60 * 24); // 1 day

      let pending = ethers.formatEther(
        await liquidity.pendingReward(0, await alice.getAddress())
      );

      let expected = (
        ((1 / (60 * 60 * 24 * 365)) * (60 * 60 * 24) * 1) /
        1
      ).toFixed(8);

      expect(+pending).to.be.greaterThanOrEqual(+expected * 0.95);
      expect(+pending).to.be.lessThanOrEqual(+expected * 1.05);

      await liquidity.connect(alice).withdraw(0, ethers.parseEther("1"));
      let rewardBalance = ethers.formatEther(
        await tokenRewardOneOvaReferral.balanceOf(await alice.getAddress())
      );

      expect(+rewardBalance).to.be.greaterThanOrEqual(+expected * 0.95);
      expect(+rewardBalance).to.be.lessThanOrEqual(+expected * 1.05);

      await time.increase(60 * 60 * 24 * 2); // 2 day

      await expect(
        await liquidity.connect(alice).deposit(0, ethers.parseEther("9"))
      ).to.emit(liquidity, "Deposit");

      await time.increase(60 * 60 * 24 * 30); // 30 day

      pending = ethers.formatEther(
        await liquidity.pendingReward(0, await alice.getAddress())
      );

      expected = (
        ((9 / (60 * 60 * 24 * 365)) * (60 * 60 * 24 * 30) * 1) /
        1
      ).toFixed(8);

      expect(+pending).to.be.greaterThanOrEqual(+expected * 0.95);
      expect(+pending).to.be.lessThanOrEqual(+expected * 1.05);

      await liquidity.connect(alice).withdraw(0, ethers.parseEther("9"));
      rewardBalance = ethers.formatEther(
        await tokenRewardOneOvaReferral.balanceOf(await alice.getAddress())
      );

      expect(+rewardBalance).to.be.greaterThanOrEqual(+expected * 0.95);
      expect(+rewardBalance).to.be.lessThanOrEqual(+expected * 1.05);

      await time.increase(60 * 60 * 24); // 1 day

      // clear reward balaance
      await tokenRewardOneOvaReferral
        .connect(alice)
        .transfer(
          await owner.getAddress(),
          await tokenRewardOneOvaReferral.balanceOf(await alice.getAddress())
        );

      await liquidity.connect(alice).deposit(0, ethers.parseEther("10"));

      await time.increase(60 * 60 * 24 * 30); // 30 days

      pending = ethers.formatEther(
        await liquidity.pendingReward(0, await alice.getAddress())
      );
      expected = (
        ((10 / (60 * 60 * 24 * 365)) * (60 * 60 * 24 * 30) * 1) /
        1
      ).toFixed(8);
      expect(+pending).to.be.greaterThanOrEqual(+expected * 0.95);
      expect(+pending).to.be.lessThanOrEqual(+expected * 1.05);

      await liquidity.connect(alice).deposit(0, ethers.parseEther("10"));

      // harvest on deposit
      rewardBalance = ethers.formatEther(
        await tokenRewardOneOvaReferral.balanceOf(await alice.getAddress())
      );
      expect(+rewardBalance).to.be.greaterThanOrEqual(+expected * 0.95);
      expect(+rewardBalance).to.be.lessThanOrEqual(+expected * 1.05);

      await time.increase(60 * 60 * 24 * 30); // 30 days

      pending = ethers.formatEther(
        await liquidity.pendingReward(0, await alice.getAddress())
      );
      expected = (
        ((20 / (60 * 60 * 24 * 365)) * (60 * 60 * 24 * 30) * 1) /
        1
      ).toFixed(8);
      expect(+pending).to.be.greaterThanOrEqual(+expected * 0.95);
      expect(+pending).to.be.lessThanOrEqual(+expected * 1.05);
    });

    it("Rewards for staked liquidity / 1000", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral, alice } =
        await loadFixture(deployFixture);

      // The held liquidity is slight more than 20 as virtual price is > 1.0 but as we use a 5% error in our calculations the results will still be in the range

      await stakedAsset.transfer(alice.getAddress(), ethers.parseEther("10"));
      await stakedAsset
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.MaxUint256);

      await liquidity.setRewardForStakedAssets(
        tokenRewardOneOvaReferral.getAddress(),
        1000000,
        1000000000
      );
      await liquidity.addWithNumCoinsAndPool(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        3,
        CURVE_DAI_USDC_USDT_POOL,
        true
      );

      await expect(
        await liquidity.connect(alice).deposit(0, ethers.parseEther("1"))
      ).to.emit(liquidity, "Deposit");

      await time.increase(60 * 60 * 24); // 1 day

      let pending = ethers.formatEther(
        await liquidity.pendingReward(0, await alice.getAddress())
      );

      let expected = (
        ((1 / (60 * 60 * 24 * 365)) * (60 * 60 * 24) * 1) /
        1000
      ).toFixed(8);

      expect(+pending).to.be.greaterThanOrEqual(+expected * 0.95);
      expect(+pending).to.be.lessThanOrEqual(+expected * 1.05);

      await liquidity.connect(alice).withdraw(0, ethers.parseEther("1"));
      let rewardBalance = ethers.formatEther(
        await tokenRewardOneOvaReferral.balanceOf(await alice.getAddress())
      );

      expect(+rewardBalance).to.be.greaterThanOrEqual(+expected * 0.95);
      expect(+rewardBalance).to.be.lessThanOrEqual(+expected * 1.05);

      await time.increase(60 * 60 * 24 * 2); // 2 day

      await expect(
        await liquidity.connect(alice).deposit(0, ethers.parseEther("9"))
      ).to.emit(liquidity, "Deposit");

      await time.increase(60 * 60 * 24 * 30); // 1 day

      pending = ethers.formatEther(
        await liquidity.pendingReward(0, await alice.getAddress())
      );

      expected = (
        ((9 / (60 * 60 * 24 * 365)) * (60 * 60 * 24 * 30) * 1) /
        1000
      ).toFixed(8);

      expect(+pending).to.be.greaterThanOrEqual(+expected * 0.95);
      expect(+pending).to.be.lessThanOrEqual(+expected * 1.05);

      await liquidity.connect(alice).withdraw(0, ethers.parseEther("9"));
      rewardBalance = ethers.formatEther(
        await tokenRewardOneOvaReferral.balanceOf(await alice.getAddress())
      );

      expect(+rewardBalance).to.be.greaterThanOrEqual(+expected * 0.95);
      expect(+rewardBalance).to.be.lessThanOrEqual(+expected * 1.05);
    });
  });
});
