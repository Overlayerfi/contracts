import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { swap } from "../scripts/uniswap_swapper/proxy";
import { DAI_ABI } from "../scripts/abi/DAI_abi";
import { DAI_ADDRESS } from "../scripts/addresses";

// CurveStableStake was removed. Referral accounting is covered here with SingleStableStake.
describe("SingleStableStake", function () {
  async function deployFixture() {
    const latestTime: number = await time.latest();
    const [owner, alice] = await ethers.getSigners();

    const block = await owner.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const defaultTransactionOptions = {
      maxFeePerGas: baseFee * BigInt(2)
    };

    await swap("4", "1");
    const stakedAsset = new ethers.Contract(DAI_ADDRESS, DAI_ABI, owner);
    await stakedAsset
      .connect(owner)
      .transfer(alice.address, await stakedAsset.balanceOf(owner.address));

    const SingleLiquidity = await ethers.getContractFactory(
      "SingleStableStake"
    );
    const singleLiquidity = await SingleLiquidity.deploy(
      owner.getAddress(),
      defaultTransactionOptions
    );
    await singleLiquidity.waitForDeployment();
    const secondLiquidity = await SingleLiquidity.deploy(
      owner.getAddress(),
      defaultTransactionOptions
    );
    await secondLiquidity.waitForDeployment();

    const TokenRewardOneOverlayerReferral = await ethers.getContractFactory(
      "OverlayerReferral"
    );
    const tokenRewardOneOverlayerReferral =
      await TokenRewardOneOverlayerReferral.deploy(
        owner.address,
        defaultTransactionOptions
      );
    await tokenRewardOneOverlayerReferral.waitForDeployment();

    await tokenRewardOneOverlayerReferral.addPointsTracker(
      await singleLiquidity.getAddress()
    );
    await tokenRewardOneOverlayerReferral.addPointsTracker(
      await secondLiquidity.getAddress()
    );
    await tokenRewardOneOverlayerReferral.setStakingPools([
      await singleLiquidity.getAddress(),
      await secondLiquidity.getAddress()
    ]);
    await tokenRewardOneOverlayerReferral
      .connect(owner)
      .setMinter(await singleLiquidity.getAddress());
    await tokenRewardOneOverlayerReferral
      .connect(owner)
      .setMinter(await secondLiquidity.getAddress());

    await stakedAsset
      .connect(alice)
      .approve(await singleLiquidity.getAddress(), ethers.MaxUint256);
    await stakedAsset
      .connect(alice)
      .approve(await secondLiquidity.getAddress(), ethers.MaxUint256);

    await singleLiquidity.updateReferral(
      await tokenRewardOneOverlayerReferral.getAddress()
    );
    await secondLiquidity.updateReferral(
      await tokenRewardOneOverlayerReferral.getAddress()
    );

    return {
      singleLiquidity,
      secondLiquidity,
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
          singleLiquidity,
          secondLiquidity,
          stakedAsset,
          tokenRewardOneOverlayerReferral,
          owner,
          alice
        } = await loadFixture(deployFixture);
        await singleLiquidity.setRewardForStakedAssets(
          tokenRewardOneOverlayerReferral.getAddress(),
          200_000,
          1
        );
        await secondLiquidity.setRewardForStakedAssets(
          tokenRewardOneOverlayerReferral.getAddress(),
          100_000,
          1
        );
        await singleLiquidity.add(
          stakedAsset.getAddress(),
          tokenRewardOneOverlayerReferral.getAddress(),
          1,
          0,
          false,
          true
        );
        await secondLiquidity.add(
          stakedAsset.getAddress(),
          tokenRewardOneOverlayerReferral.getAddress(),
          1,
          0,
          false,
          true
        );
        expect(await singleLiquidity.poolLength()).to.equal(1);
        expect(await secondLiquidity.poolLength()).to.equal(1);

        await singleLiquidity
          .connect(alice)
          .deposit(0, ethers.parseEther("10"));
        await secondLiquidity
          .connect(alice)
          .deposit(0, ethers.parseEther("10"));

        await time.increase(60 * 60 * 24);

        expect(
          await singleLiquidity.pendingReward(0, alice.address)
        ).to.be.greaterThan(0);
        expect(
          await secondLiquidity.pendingReward(0, alice.address)
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

        expect(
          await singleLiquidity.pendingReward(0, alice.address)
        ).to.be.equal(0);
        expect(
          await secondLiquidity.pendingReward(0, alice.address)
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
        await time.increase(60 * 60 * 24 * days);

        await singleLiquidity
          .connect(alice)
          .withdraw(0, ethers.parseEther("10"));
        await secondLiquidity
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
