import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect, assert } from "chai";

describe("Liquidity", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    const latestTime: number = await time.latest();
    // Contracts are deployed using the first signer/account by default
    const [owner, notOwner, alice, bob] = await ethers.getSigners();

    const block = await owner.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const defaultTransactionOptions = {
      maxFeePerGas: baseFee * BigInt(10)
    };

    const Liquidity = await ethers.getContractFactory("Liquidity");
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
      await liquidity.setReward(tokenRewardOneOvaReferral.getAddress(), 1);
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        0,
        false,
        true
      );
      expect(await liquidity.poolLength()).to.equal(1);
      await liquidity.setReward(stakedAsset.getAddress(), 1);
      await liquidity.add(
        tokenRewardOneOvaReferral.getAddress(),
        stakedAsset.getAddress(),
        1,
        0,
        false,
        true
      );
      expect(await liquidity.poolLength()).to.equal(2);
    });

    it("Should return correct allocation points for different pools", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOvaReferral,
        tokenRewardTwo
      } = await loadFixture(deployFixture);
      await liquidity.setReward(tokenRewardOneOvaReferral.getAddress(), 1);
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        0,
        false,
        true
      );
      expect(await liquidity.poolLength()).to.equal(1);
      await liquidity.setReward(stakedAsset.getAddress(), 1);
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
      await liquidity.setReward(tokenRewardOneOvaReferral.getAddress(), 1);
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
      await liquidity.setReward(stakedAsset.getAddress(), 1);
      expect(
        await liquidity.activeRewards(stakedAsset.getAddress())
      ).to.be.equal(true);
    });

    it("Should change reward rate", async function () {
      const { liquidity, stakedAsset } = await loadFixture(deployFixture);
      await liquidity.setReward(stakedAsset.getAddress(), 1);
      expect(
        await liquidity.activeRewards(stakedAsset.getAddress())
      ).to.be.equal(true);
      expect(
        await liquidity.rewardsPerSecond(stakedAsset.getAddress())
      ).to.be.equal(1);
      await liquidity.setReward(stakedAsset.getAddress(), 10);
      expect(
        await liquidity.rewardsPerSecond(stakedAsset.getAddress())
      ).to.be.equal(10);
    });

    it("Should not set reward", async function () {
      const { liquidity, stakedAsset, notOwner } = await loadFixture(
        deployFixture
      );
      await expect(
        liquidity.connect(notOwner).setReward(stakedAsset.getAddress(), 1)
      ).to.be.eventually.rejected;
    });
  });

  describe("SetPool", function () {
    it("Should set pool", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral } =
        await loadFixture(deployFixture);
      await liquidity.setReward(stakedAsset.getAddress(), 1);
      await liquidity.add(
        tokenRewardOneOvaReferral.getAddress(),
        stakedAsset.getAddress(),
        1,
        0,
        false,
        true
      );
      expect(await liquidity.poolLength()).to.equal(1);
      expect(
        await liquidity.totalAllocPointsPerReward(stakedAsset.getAddress())
      ).to.be.equal(1);
      await liquidity.setPoolAllocPoints(0, 10, true);
      expect(
        await liquidity.totalAllocPointsPerReward(stakedAsset.getAddress())
      ).to.be.equal(10);
      expect((await liquidity.poolInfo(0)).allocPoints).to.be.equal(10);
    });

    it("Should not add a new pool if not owner", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral, notOwner } =
        await loadFixture(deployFixture);
      await liquidity.setReward(stakedAsset.getAddress(), 1);
      await liquidity.add(
        tokenRewardOneOvaReferral.getAddress(),
        stakedAsset.getAddress(),
        1,
        0,
        false,
        true
      );
      await expect(liquidity.connect(notOwner).setPoolAllocPoints(0, 10, true))
        .to.be.eventually.rejected;
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

      await liquidity.setReward(tokenRewardOneOvaReferral.getAddress(), 1);
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

      const latestTime: number = await time.latest();
      await time.increaseTo(latestTime + 1);
      const amount = ethers.parseEther("1");
      await stakedAsset.transfer(alice.getAddress(), amount);
      await stakedAsset.connect(alice).approve(liquidity.getAddress(), amount);

      await liquidity.setReward(
        tokenRewardOneOvaReferral.getAddress(),
        ethers.parseEther("1")
      );
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

      const expected = 60 * 60;

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

    it("Should harvest and not withraw before end time if vesting", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral, alice } =
        await loadFixture(deployFixture);
      const n = "5";
      const amount = ethers.parseEther(n);
      await stakedAsset.transfer(
        alice.getAddress(),
        ethers.parseEther((+n * 2).toFixed(1))
      );

      await stakedAsset
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.MaxUint256);

      const latestTime: number = await time.latest();

      await liquidity.setReward(tokenRewardOneOvaReferral.getAddress(), 1);
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        latestTime + 60 * 60 * 24 * 10,
        true,
        true
      );

      expect(
        await tokenRewardOneOvaReferral.balanceOf(alice.address)
      ).to.be.equal(0);
      await expect(await liquidity.connect(alice).deposit(0, amount)).to.emit(
        liquidity,
        "Deposit"
      );
      expect(
        await tokenRewardOneOvaReferral.balanceOf(alice.address)
      ).to.be.equal(0);

      await expect(liquidity.connect(alice).harvest(0)).to.be.not.eventually
        .rejected;
      await time.increaseTo(latestTime + 60 * 60 * 24 * 3);
      await expect(await liquidity.connect(alice).deposit(0, amount)).to.emit(
        liquidity,
        "Deposit"
      );
      // Sequental deposits should harvest before endTimestamp
      const firstBal = await tokenRewardOneOvaReferral.balanceOf(alice.address);
      expect(firstBal).to.be.greaterThan(0);
      await expect(liquidity.connect(alice).withdraw(0, amount)).to.be
        .eventually.rejected;
      await time.increaseTo(latestTime + 60 * 60 * 24 * 10 + 1);
      await expect(await liquidity.connect(alice).withdraw(0, amount)).to.emit(
        liquidity,
        "Withdraw"
      );
      const secondBal = await tokenRewardOneOvaReferral.balanceOf(
        alice.address
      );
      expect(secondBal).to.be.greaterThan(firstBal);
    });

    it("Deposit, harvest and withdraw with referral", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOvaReferral,
        owner,
        alice,
        bob
      } = await loadFixture(deployFixture);

      const latestTime: number = await time.latest();
      await time.increaseTo(latestTime + 1);

      await stakedAsset.transfer(alice.getAddress(), ethers.parseEther("10"));

      await stakedAsset
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.parseEther("10"));
      await stakedAsset
        .connect(owner)
        .approve(liquidity.getAddress(), ethers.parseEther("10"));

      await liquidity.setReward(tokenRewardOneOvaReferral.getAddress(), 1);
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        0,
        false,
        true
      );

      const referral = await tokenRewardOneOvaReferral.getAddress();
      // Make the liquidity contract an allowed referral tracker
      await tokenRewardOneOvaReferral
        .connect(owner)
        .addPointsTracker(await liquidity.getAddress());
      await liquidity.connect(owner).updateReferral(referral);

      await tokenRewardOneOvaReferral
        .connect(owner)
        .addCode("BOB", bob.address);

      // Consume referral code
      await tokenRewardOneOvaReferral.connect(alice).consumeReferral("BOB");
      await tokenRewardOneOvaReferral.connect(owner).consumeReferral("BOB");

      // Test an increasing amount of bonus payed out
      await expect(
        await liquidity.connect(alice).deposit(0, ethers.parseEther("2"))
      ).to.emit(liquidity, "Deposit");
      await expect(
        await liquidity.connect(owner).deposit(0, ethers.parseEther("2"))
      ).to.emit(liquidity, "Deposit");
      expect(
        await tokenRewardOneOvaReferral.balanceOf(alice.address)
      ).to.be.equal(0);
      expect(
        await tokenRewardOneOvaReferral.balanceOf(bob.address)
      ).to.be.equal(0);

      await time.increaseTo((await time.latest()) + 60 * 60 * 24 * 10);

      const pendingRewardsAlice = ethers.formatEther(
        await liquidity.pendingReward(0, await alice.getAddress())
      );
      const pendingRewardsOwner = ethers.formatEther(
        await liquidity.pendingReward(0, await owner.getAddress())
      );
      const pendingRewardsRefBob = ethers.formatEther(
        await liquidity.pendingRewardsReferral("BOB", 0, 0, 0)
      );
      expect(+pendingRewardsRefBob).to.be.greaterThanOrEqual(
        0.99 * +pendingRewardsAlice + +pendingRewardsOwner
      );
      expect(+pendingRewardsRefBob).to.be.lessThanOrEqual(
        1.01 * +pendingRewardsAlice + +pendingRewardsOwner
      );

      await expect(
        await liquidity.connect(alice).deposit(0, ethers.parseEther("3"))
      ).to.emit(liquidity, "Deposit");
      expect(
        await tokenRewardOneOvaReferral.balanceOf(alice.address)
      ).to.be.greaterThan(0);
      let bobBonus = await tokenRewardOneOvaReferral.balanceOf(bob.address);
      expect(bobBonus).to.be.greaterThan(0);
      await time.increaseTo((await time.latest()) + 60 * 60 * 24 * 10);
      await expect(
        await liquidity.connect(alice).deposit(0, ethers.parseEther("5"))
      ).to.emit(liquidity, "Deposit");
      expect(
        await tokenRewardOneOvaReferral.balanceOf(bob.address)
      ).to.be.greaterThan(bobBonus);
      bobBonus = await tokenRewardOneOvaReferral.balanceOf(bob.address);

      // Check total points generated from the referral source
      expect(
        await tokenRewardOneOvaReferral.generatedPoints(bob.address)
      ).to.be.greaterThan(0);

      // Check harvest do generate bonuses
      await time.increaseTo((await time.latest()) + 60 * 60 * 24 * 10);
      expect(await liquidity.connect(alice).harvest(0)).to.emit(
        liquidity,
        "SelfBonusPayed"
      );
      expect(
        await tokenRewardOneOvaReferral.balanceOf(bob.address)
      ).to.be.greaterThan(bobBonus);
      bobBonus = await tokenRewardOneOvaReferral.balanceOf(bob.address);

      // Check withdraw do generate bonuses
      await time.increaseTo((await time.latest()) + 60 * 60 * 24 * 10);
      expect(
        await liquidity.connect(alice).withdraw(0, ethers.parseEther("10"))
      ).to.emit(liquidity, "BonusPayed");
      expect(
        await tokenRewardOneOvaReferral.balanceOf(bob.address)
      ).to.be.greaterThan(bobBonus);
    });

    it("Should return right pending reward with timestamp advance", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral, alice, bob } =
        await loadFixture(deployFixture);
      const users: Array<any> = [alice, bob];
      const PARTICIPATION: string = "10";
      const TOTAL_PARTICIPATION: string = (
        users.length * +PARTICIPATION
      ).toString();
      const REWARD_PER_SECOND: string = "1";

      const lastestTime = await time.latest();
      await time.increaseTo(lastestTime + 1);
      await liquidity.setReward(
        tokenRewardOneOvaReferral.getAddress(),
        ethers.parseEther(REWARD_PER_SECOND)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        0,
        false,
        true
      );

      await stakedAsset.transfer(
        alice.getAddress(),
        ethers.parseEther(PARTICIPATION)
      );
      await stakedAsset.transfer(
        bob.getAddress(),
        ethers.parseEther(PARTICIPATION)
      );
      await stakedAsset
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.parseEther(PARTICIPATION));
      await stakedAsset
        .connect(bob)
        .approve(liquidity.getAddress(), ethers.parseEther(PARTICIPATION));
      expect(
        await stakedAsset.allowance(alice.getAddress(), liquidity.getAddress())
      ).to.equal(ethers.parseEther(PARTICIPATION));
      expect(
        await stakedAsset.allowance(bob.getAddress(), liquidity.getAddress())
      ).to.equal(ethers.parseEther(PARTICIPATION));

      await expect(
        await liquidity
          .connect(alice)
          .deposit(0, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterAliceDeposit: number = await time.latest();

      await expect(
        await liquidity
          .connect(bob)
          .deposit(0, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterBobDeposit: number = await time.latest();

      expect(await stakedAsset.balanceOf(alice.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await stakedAsset.balanceOf(bob.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await liquidity.getTotalStakedInPool(0)).to.equal(
        ethers.parseEther("20")
      );

      const SECONDS_TO_MINE: number = 100;
      await time.increaseTo(afterBobDeposit + SECONDS_TO_MINE);
      // two users, there is alice and bob supply
      let commonRewardBlocks: number = SECONDS_TO_MINE;
      // one users, there is only alice supply for these blocks
      const onlyAliceRewardBlock: number = afterBobDeposit - afterAliceDeposit;
      const twoUserTotalSupply: number = +TOTAL_PARTICIPATION;
      const oneUserTotalSupply: number = +PARTICIPATION;

      expect(await liquidity.pendingReward(0, alice.getAddress())).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
              commonRewardBlocks *
              +REWARD_PER_SECOND +
            (+PARTICIPATION * onlyAliceRewardBlock * +REWARD_PER_SECOND) /
              oneUserTotalSupply
          ).toString()
        )
      );
      expect(await liquidity.pendingReward(0, bob.getAddress())).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
            commonRewardBlocks *
            +REWARD_PER_SECOND
          ).toString()
        )
      );

      await time.increaseTo(afterBobDeposit + SECONDS_TO_MINE * 2);
      commonRewardBlocks = SECONDS_TO_MINE * 2;
      expect(await liquidity.pendingReward(0, alice.getAddress())).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
              commonRewardBlocks *
              +REWARD_PER_SECOND +
            (+PARTICIPATION * onlyAliceRewardBlock * +REWARD_PER_SECOND) /
              oneUserTotalSupply
          ).toString()
        )
      );
      expect(await liquidity.pendingReward(0, bob.getAddress())).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
            commonRewardBlocks *
            +REWARD_PER_SECOND
          ).toString()
        )
      );
    });

    it("Should have proportioned reward with same reward blocks and deposit with different weights", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOvaReferral,
        tokenRewardTwo,
        alice,
        bob
      } = await loadFixture(deployFixture);
      const PARTICIPATION: string = "10";
      const REWARD_PER_SECOND: string = "1";

      const latestTime: number = await time.latest();
      await time.increaseTo(latestTime + 1);
      await liquidity.setReward(
        tokenRewardOneOvaReferral.getAddress(),
        ethers.parseEther(REWARD_PER_SECOND)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1000,
        0,
        false,
        true
      );
      await liquidity.add(
        tokenRewardTwo.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        2000,
        0,
        false,
        true
      );

      await stakedAsset.transfer(
        alice.getAddress(),
        ethers.parseEther(PARTICIPATION)
      );
      await tokenRewardTwo.transfer(
        bob.getAddress(),
        ethers.parseEther(PARTICIPATION)
      );
      await stakedAsset
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.parseEther(PARTICIPATION));
      await tokenRewardTwo
        .connect(bob)
        .approve(liquidity.getAddress(), ethers.parseEther(PARTICIPATION));
      expect(
        await stakedAsset.allowance(alice.getAddress(), liquidity.getAddress())
      ).to.equal(ethers.parseEther(PARTICIPATION));
      expect(
        await tokenRewardTwo.allowance(bob.getAddress(), liquidity.getAddress())
      ).to.equal(ethers.parseEther(PARTICIPATION));

      await expect(
        await liquidity
          .connect(alice)
          .deposit(0, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterAliceDeposit: number = await time.latest();

      expect(await tokenRewardTwo.balanceOf(bob.getAddress())).to.be.equal(
        ethers.parseEther(PARTICIPATION)
      );
      await expect(
        await liquidity
          .connect(bob)
          .deposit(1, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterBobDeposit: number = await time.latest();

      expect(await stakedAsset.balanceOf(alice.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await tokenRewardTwo.balanceOf(bob.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await liquidity.getTotalStakedInPool(0)).to.equal(
        ethers.parseEther(PARTICIPATION)
      );
      expect(await liquidity.getTotalStakedInPool(1)).to.equal(
        ethers.parseEther(PARTICIPATION)
      );

      const SECONDS_TO_MINE: number = 100;
      await time.increaseTo(afterBobDeposit + SECONDS_TO_MINE);
      // two users, there is alice and bob supply
      let commonRewardBlocks: number = SECONDS_TO_MINE;
      // one users, there is only alice supply for these blocks
      const onlyAliceRewardBlock: number = afterBobDeposit - afterAliceDeposit;
      const oneUserTotalSupply: number = +PARTICIPATION;

      expect(
        +ethers.formatEther(
          await liquidity.pendingReward(0, alice.getAddress())
        )
      ).to.greaterThanOrEqual(
        Math.floor(
          +(
            (+PARTICIPATION *
              commonRewardBlocks *
              +REWARD_PER_SECOND *
              (1 / 3)) /
              +oneUserTotalSupply +
            (+PARTICIPATION *
              onlyAliceRewardBlock *
              +REWARD_PER_SECOND *
              (1 / 3)) /
              +oneUserTotalSupply
          ).toFixed(1)
        )
      );
      expect(
        +ethers.formatEther(await liquidity.pendingReward(1, bob.getAddress()))
      ).to.greaterThanOrEqual(
        Math.floor(
          +(
            (+PARTICIPATION *
              commonRewardBlocks *
              +REWARD_PER_SECOND *
              (2 / 3)) /
            +oneUserTotalSupply
          ).toFixed(1)
        )
      );
    });

    it("Should have same reward with same reward blocks and deposit", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral, alice, bob } =
        await loadFixture(deployFixture);
      const users: Array<any> = [alice, bob];
      const PARTICIPATION: string = "10";
      const TOTAL_PARTICIPATION: string = (
        users.length * +PARTICIPATION
      ).toString();
      const REWARD_PER_SECOND: string = "1";

      const latestTime: number = await time.latest();
      await time.increaseTo(latestTime + 1);
      await liquidity.setReward(
        tokenRewardOneOvaReferral.getAddress(),
        ethers.parseEther(REWARD_PER_SECOND)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        0,
        false,
        true
      );

      await stakedAsset.transfer(
        alice.getAddress(),
        ethers.parseEther(PARTICIPATION)
      );
      await stakedAsset.transfer(
        bob.getAddress(),
        ethers.parseEther(PARTICIPATION)
      );
      await stakedAsset
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.parseEther(PARTICIPATION));
      await stakedAsset
        .connect(bob)
        .approve(liquidity.getAddress(), ethers.parseEther(PARTICIPATION));
      expect(
        await stakedAsset.allowance(alice.getAddress(), liquidity.getAddress())
      ).to.equal(ethers.parseEther(PARTICIPATION));
      expect(
        await stakedAsset.allowance(bob.getAddress(), liquidity.getAddress())
      ).to.equal(ethers.parseEther(PARTICIPATION));

      await expect(
        await liquidity
          .connect(alice)
          .deposit(0, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterAliceDeposit: number = await time.latest();

      await expect(
        await liquidity
          .connect(bob)
          .deposit(0, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterBobDeposit: number = await time.latest();

      expect(await stakedAsset.balanceOf(alice.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await stakedAsset.balanceOf(bob.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await liquidity.getTotalStakedInPool(0)).to.equal(
        ethers.parseEther("20")
      );

      const SECONDS_TO_MINE: number = 100;
      await time.increaseTo(afterBobDeposit + SECONDS_TO_MINE);
      // two users, there is alice and bob supply
      let commonRewardBlocks: number = SECONDS_TO_MINE;
      // one users, there is only alice supply for these blocks
      const onlyAliceRewardBlock: number = afterBobDeposit - afterAliceDeposit;
      const twoUserTotalSupply: number = +TOTAL_PARTICIPATION;
      const oneUserTotalSupply: number = +PARTICIPATION;

      expect(await liquidity.pendingReward(0, alice.getAddress())).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
              commonRewardBlocks *
              +REWARD_PER_SECOND +
            (+PARTICIPATION * onlyAliceRewardBlock * +REWARD_PER_SECOND) /
              oneUserTotalSupply
          ).toString()
        )
      );
      expect(await liquidity.pendingReward(0, bob.getAddress())).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
            commonRewardBlocks *
            +REWARD_PER_SECOND
          ).toString()
        )
      );

      await expect(
        await liquidity
          .connect(alice)
          .withdraw(0, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Withdraw");
      await expect(
        await liquidity
          .connect(bob)
          .withdraw(0, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Withdraw");
      const aliceReward = await tokenRewardOneOvaReferral.balanceOf(
        alice.getAddress()
      );
      const bobReward = await tokenRewardOneOvaReferral.balanceOf(
        bob.getAddress()
      );
      assert.isTrue(
        ethers.formatEther(aliceReward) === ethers.formatEther(bobReward)
      );
    });

    it("Should have double reward with same blocks and double deposit deposit", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral, alice, bob } =
        await loadFixture(deployFixture);
      const PARTICIPATION: string = "10";
      const HALF_PARTICIPATION: string = "5";
      const TOTAL_PARTICIPATION: string = "15";
      const REWARD_PER_SECOND: string = "1";

      const latestTime: number = await time.latest();
      await time.increaseTo(latestTime + 1);
      await liquidity.setReward(
        tokenRewardOneOvaReferral.getAddress(),
        ethers.parseEther(REWARD_PER_SECOND)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        0,
        false,
        true
      );

      await stakedAsset.transfer(
        alice.getAddress(),
        ethers.parseEther(PARTICIPATION)
      );
      await stakedAsset.transfer(
        bob.getAddress(),
        ethers.parseEther(HALF_PARTICIPATION)
      );
      await stakedAsset
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.parseEther(PARTICIPATION));
      await stakedAsset
        .connect(bob)
        .approve(liquidity.getAddress(), ethers.parseEther(HALF_PARTICIPATION));
      expect(
        await stakedAsset.allowance(alice.getAddress(), liquidity.getAddress())
      ).to.equal(ethers.parseEther(PARTICIPATION));
      expect(
        await stakedAsset.allowance(bob.getAddress(), liquidity.getAddress())
      ).to.equal(ethers.parseEther(HALF_PARTICIPATION));

      await expect(
        await liquidity
          .connect(alice)
          .deposit(0, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterAliceDeposit: number = await time.latest();

      await expect(
        await liquidity
          .connect(bob)
          .deposit(0, ethers.parseEther(HALF_PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterBobDeposit: number = await time.latest();

      expect(await stakedAsset.balanceOf(alice.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await stakedAsset.balanceOf(bob.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await liquidity.getTotalStakedInPool(0)).to.equal(
        ethers.parseEther("15")
      );

      const SECONDS_TO_MINE: number = 100;
      await time.increaseTo(afterBobDeposit + SECONDS_TO_MINE);
      // two users, there is alice and bob supply
      let commonRewardBlocks: number = SECONDS_TO_MINE;
      // one users, there is only alice supply for these blocks
      const onlyAliceRewardBlock: number = afterBobDeposit - afterAliceDeposit;
      const oneUserTotalSupply: number = +PARTICIPATION;

      expect(
        ethers
          .formatEther(await liquidity.pendingReward(0, alice.getAddress()))
          .substring(0, 4)
      ).to.equal(
        (
          (+PARTICIPATION / +TOTAL_PARTICIPATION) *
            commonRewardBlocks *
            +REWARD_PER_SECOND +
          (+PARTICIPATION * onlyAliceRewardBlock * +REWARD_PER_SECOND) /
            oneUserTotalSupply
        )
          .toString()
          .substring(0, 4)
      );
      expect(
        ethers
          .formatEther(await liquidity.pendingReward(0, bob.getAddress()))
          .substring(0, 4)
      ).to.equal(
        (
          (+HALF_PARTICIPATION / +TOTAL_PARTICIPATION) *
          commonRewardBlocks *
          +REWARD_PER_SECOND
        )
          .toString()
          .substring(0, 4)
      );

      const expectedAliceReward: number = 68.3;
      const expectedBobReward: number = 69.4;
      await expect(
        await liquidity
          .connect(alice)
          .withdraw(0, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Withdraw");
      await expect(
        await liquidity
          .connect(bob)
          .withdraw(0, ethers.parseEther(HALF_PARTICIPATION))
      ).to.emit(liquidity, "Withdraw");
      const aliceReward = await tokenRewardOneOvaReferral.balanceOf(
        alice.getAddress()
      );
      const bobReward = await tokenRewardOneOvaReferral.balanceOf(
        bob.getAddress()
      );
      assert.isTrue(
        +(+ethers.formatEther(aliceReward)).toFixed(1) === expectedAliceReward
      );
      assert.isTrue(
        +(+ethers.formatEther(bobReward)).toFixed(1) * 2 === expectedBobReward
      );
    });

    it("Should harvest correct amount", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral, alice, bob } =
        await loadFixture(deployFixture);
      const users: Array<any> = [alice, bob];
      const PARTICIPATION: string = "10";
      const TOTAL_PARTICIPATION: string = (
        users.length * +PARTICIPATION
      ).toString();
      const REWARD_PER_SECOND: string = "1";

      const latestTime: number = await time.latest();
      await time.increaseTo(latestTime + 1);
      await liquidity.setReward(
        tokenRewardOneOvaReferral.getAddress(),
        ethers.parseEther(REWARD_PER_SECOND)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        0,
        false,
        true
      );

      await stakedAsset.transfer(
        alice.getAddress(),
        ethers.parseEther(PARTICIPATION)
      );
      await stakedAsset.transfer(
        bob.getAddress(),
        ethers.parseEther(PARTICIPATION)
      );
      await stakedAsset
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.parseEther(PARTICIPATION));
      await stakedAsset
        .connect(bob)
        .approve(liquidity.getAddress(), ethers.parseEther(PARTICIPATION));
      expect(
        await stakedAsset.allowance(alice.getAddress(), liquidity.getAddress())
      ).to.equal(ethers.parseEther(PARTICIPATION));
      expect(
        await stakedAsset.allowance(bob.getAddress(), liquidity.getAddress())
      ).to.equal(ethers.parseEther(PARTICIPATION));

      await expect(
        await liquidity
          .connect(alice)
          .deposit(0, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterAliceDeposit: number = await time.latest();

      await expect(
        await liquidity
          .connect(bob)
          .deposit(0, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterBobDeposit: number = await time.latest();

      expect(await stakedAsset.balanceOf(alice.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await stakedAsset.balanceOf(bob.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await liquidity.getTotalStakedInPool(0)).to.equal(
        ethers.parseEther("20")
      );

      const SECONDS_TO_MINE: number = 100;
      await time.increaseTo(afterBobDeposit + SECONDS_TO_MINE);
      // two users, there is alice and bob supply
      let commonRewardBlocks: number = SECONDS_TO_MINE;
      // one users, there is only alice supply for these blocks
      const onlyAliceRewardBlock: number = afterBobDeposit - afterAliceDeposit;
      const twoUserTotalSupply: number = +TOTAL_PARTICIPATION;
      const oneUserTotalSupply: number = +PARTICIPATION;

      const beforeAliceHarvestBlock: number = await time.latest();
      expect(await liquidity.connect(alice).harvest(0)).to.emit(
        liquidity,
        "Harvest"
      );
      const afterAliceHarverstBlock: number = await time.latest();
      expect(await liquidity.connect(bob).harvest(0)).to.emit(
        liquidity,
        "Harvest"
      );
      const afterBobHarverstBlock: number = await time.latest();
      const aliceHarverstBlocksToAdd: number =
        afterAliceHarverstBlock - beforeAliceHarvestBlock;
      const bobHarvestBlocksToAdd: number =
        afterBobHarverstBlock - beforeAliceHarvestBlock;

      expect(
        await tokenRewardOneOvaReferral.balanceOf(alice.getAddress())
      ).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
              (commonRewardBlocks + aliceHarverstBlocksToAdd) *
              +REWARD_PER_SECOND +
            (+PARTICIPATION * onlyAliceRewardBlock * +REWARD_PER_SECOND) /
              oneUserTotalSupply
          ).toString()
        )
      );
      expect(
        await tokenRewardOneOvaReferral.balanceOf(bob.getAddress())
      ).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
            (commonRewardBlocks + bobHarvestBlocksToAdd) *
            +REWARD_PER_SECOND
          ).toString()
        )
      );

      //check that new pending reward discount already harvested amount
      await time.increaseTo((await time.latest()) + 100);
      const alreadyHarvestedAmount: number = +ethers.formatEther(
        await tokenRewardOneOvaReferral.balanceOf(alice.getAddress())
      );
      const elapsedBlockFromLastUpdate: number =
        (await time.latest()) - afterBobDeposit;
      const latestUpdatedRewardPerBlock: number = 2 / +TOTAL_PARTICIPATION; //2 = num blocks between deposits
      const elapsedRewardFromUpdate: number =
        elapsedBlockFromLastUpdate / +TOTAL_PARTICIPATION; //for alice
      const newRewardPerShare: number =
        latestUpdatedRewardPerBlock + elapsedRewardFromUpdate;
      const totalReward: number = +PARTICIPATION * newRewardPerShare; //for alice since deposit
      expect(await liquidity.pendingReward(0, alice.getAddress())).to.equal(
        ethers.parseEther((totalReward - alreadyHarvestedAmount).toString())
      );
    });

    it("Should not withdraw if requested more tokens than deposited amount", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOvaReferral, alice, bob } =
        await loadFixture(deployFixture);

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

      await liquidity.setReward(tokenRewardOneOvaReferral.getAddress(), 1);
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOvaReferral.getAddress(),
        1,
        0,
        false,
        true
      );

      const latestTime: number = await time.latest();
      await time.increaseTo(latestTime + 1);
      await expect(await liquidity.connect(alice).deposit(0, 5)).to.emit(
        liquidity,
        "Deposit"
      );
      await expect(await liquidity.connect(bob).deposit(0, 5)).to.emit(
        liquidity,
        "Deposit"
      );
      await time.increaseTo(latestTime + 11);

      await expect(await liquidity.connect(alice).deposit(0, 0)).to.emit(
        liquidity,
        "Deposit"
      );
      await expect(await liquidity.connect(bob).deposit(0, 0)).to.emit(
        liquidity,
        "Deposit"
      );
      let aliceReward = await tokenRewardOneOvaReferral.balanceOf(
        alice.getAddress()
      );
      let bobReward = await tokenRewardOneOvaReferral.balanceOf(
        bob.getAddress()
      );
      assert.isTrue(aliceReward.toString() == "5");
      assert.isTrue(bobReward.toString() == "5");

      await time.increaseTo(latestTime + 40);
      await expect(liquidity.connect(alice).withdraw(0, 10)).to.be.eventually
        .rejected;
      await expect(liquidity.connect(bob).withdraw(0, 10)).to.be.eventually
        .rejected;
    });
  });
});
