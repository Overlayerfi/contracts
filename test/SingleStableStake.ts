import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect, assert } from "chai";

// This contract shares the basic staking rewards math with `Liquidity.sol` and hence some tests are being ignored as tested within the other test
describe("SingleStableStake", function () {
  async function deployFixture() {
    const latestTime: number = await time.latest();
    const [owner, notOwner, alice, bob] = await ethers.getSigners();

    // For localhost
    const block = await owner.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const defaultTransactionOptions = {
      maxFeePerGas: baseFee * BigInt(2)
    };

    const Liquidity = await ethers.getContractFactory("SingleStableStake");
    const liquidity = await Liquidity.deploy(
      owner.getAddress(),
      defaultTransactionOptions
    );

    const StakedAsset = await ethers.getContractFactory("TokenLP_A_B");
    const stakedAsset = await StakedAsset.deploy(
      ethers.parseEther("1000"),
      "LPABONE",
      "LPABONE",
      defaultTransactionOptions
    );
    await stakedAsset.setMinter(liquidity.getAddress());

    const TokenRewardOne = await ethers.getContractFactory("OvaReferral");
    const tokenRewardOneOvaReferral = await TokenRewardOne.deploy(
      owner.address,
      defaultTransactionOptions
    );
    await tokenRewardOneOvaReferral.setMinter(liquidity.getAddress());
    await tokenRewardOneOvaReferral.setStakingPools([
      await liquidity.getAddress()
    ]);
    // not using OvaReferral as in some tests we need to transfer it
    const TokenRewardTwo = await ethers.getContractFactory("TokenLP_A_B");
    const tokenRewardTwo = await TokenRewardTwo.deploy(
      ethers.parseEther("1000"),
      "LPABTWO",
      "LPABTWO",
      defaultTransactionOptions
    );
    await tokenRewardTwo.setMinter(liquidity.getAddress());

    return {
      liquidity,
      stakedAsset,
      tokenRewardOneOvaReferral,
      tokenRewardTwo,
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

    // it("Should update starting timestamp", async function () {
    //   const { liquidity, owner, latestTime } = await loadFixture(deployFixture);
    //   await liquidity.connect(owner).updateStartTime(latestTime + 100);
    //   expect(await liquidity.startTime()).to.equal(latestTime + 100);
    // });

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
    it("Should add a new pool", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral } =
        await loadFixture(deployFixture);
      await liquidity.setRewardForStakedAssets(
        tokenRewardOneOvaReferral.getAddress(),
        1,
        1
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        0,
        false,
        true
      );
      expect(await liquidity.poolLength()).to.equal(1);
    });

    it("Should return correct allocation points for different pools", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOvaReferral,
        tokenRewardTwo
      } = await loadFixture(deployFixture);
      await liquidity.setRewardForStakedAssets(
        tokenRewardOneOvaReferral.getAddress(),
        1,
        1
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        0,
        false,
        true
      );
      expect(await liquidity.poolLength()).to.equal(1);
      await liquidity.setRewardForStakedAssets(stakedAsset.getAddress(), 1, 1);
      await liquidity.add(
        tokenRewardOneOvaReferral.getAddress(),
        stakedAsset.getAddress(),
        10,
        0,
        false,
        true
      );
      expect(await liquidity.poolLength()).to.equal(2);
      await liquidity.add(
        tokenRewardTwo.getAddress(),
        stakedAsset.getAddress(),
        100,
        0,
        false,
        true
      );
      expect(await liquidity.poolLength()).to.equal(3);
      expect(
        await liquidity.totalAllocPointsPerReward(
          tokenRewardOneOvaReferral.getAddress()
        )
      ).to.be.equal(1);
      expect(
        await liquidity.totalAllocPointsPerReward(stakedAsset.getAddress())
      ).to.be.equal(110);
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
            0,
            false,
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
        await liquidity.rewardsPerYearMultiplierNum(stakedAsset.getAddress())
      ).to.be.equal(1);
      await liquidity.setRewardForStakedAssets(stakedAsset.getAddress(), 10, 1);
      expect(
        await liquidity.rewardsPerYearMultiplierNum(stakedAsset.getAddress())
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
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral, alice, bob } =
        await loadFixture(deployFixture);

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
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        0,
        false,
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

    it("Pools with endtimestamp should compute rewards uo to the end time stamp", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral, alice, bob } =
        await loadFixture(deployFixture);

      const amount = ethers.parseEther("1");
      await stakedAsset.transfer(alice.getAddress(), amount);
      await stakedAsset.connect(alice).approve(liquidity.getAddress(), amount);

      await liquidity.setReward(
        tokenRewardOneOvaReferral.getAddress(),
        ethers.parseEther("1")
      );
      await liquidity.setRewardForStakedAssets(
        tokenRewardOneOvaReferral.getAddress(),
        1,
        1
      );
      const latestTime: number = await time.latest();
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        latestTime + 60 * 60,
        false,
        true
      );

      await expect(await liquidity.connect(alice).deposit(0, amount)).to.emit(
        liquidity,
        "Deposit"
      );

      const expected = (1 / (60 * 60 * 24 * 365)) * (60 * 60);

      await time.increase(60 * 60 * 100);

      await expect(await liquidity.connect(alice).withdraw(0, amount)).to.emit(
        liquidity,
        "Withdraw"
      );

      const rewardsBal = ethers.formatEther(
        await tokenRewardOneOvaReferral.balanceOf(alice.address)
      );
      expect(+rewardsBal).to.be.greaterThan(expected * 0.99);
      expect(+rewardsBal).to.be.lessThan(expected * 1.01);
    });

    it("Rewards for staked liquidity", async function () {
      const {
        owner,
        liquidity,
        stakedAsset,
        tokenRewardOneOvaReferral,
        alice
      } = await loadFixture(deployFixture);

      await stakedAsset.transfer(alice.getAddress(), ethers.parseEther("20"));
      await stakedAsset
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.MaxUint256);

      await liquidity.setRewardForStakedAssets(
        tokenRewardOneOvaReferral.getAddress(),
        1,
        1
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        0,
        false,
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

      await stakedAsset.transfer(alice.getAddress(), ethers.parseEther("10"));
      await stakedAsset
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.MaxUint256);

      await liquidity.setRewardForStakedAssets(
        tokenRewardOneOvaReferral.getAddress(),
        1000000,
        1000000000
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        0,
        false,
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
