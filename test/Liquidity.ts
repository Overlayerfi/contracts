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

    const TokenRewardOne = await ethers.getContractFactory("OverlayerReferral");
    const tokenRewardOneOverlayerReferral = await TokenRewardOne.deploy(
      owner.address,
      defaultTransactionOptions
    );
    await tokenRewardOneOverlayerReferral.setMinter(liquidity.getAddress());
    await tokenRewardOneOverlayerReferral.setStakingPools([
      await liquidity.getAddress()
    ]);
    // not using OverlayerReferral as in some tests we need to transfer it
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
      tokenRewardOneOverlayerReferral,
      tokenRewardTwo,
      latestTime,
      owner,
      notOwner,
      alice,
      bob
    };
  }

  describe("Contract Deployment", function () {
    it("Should assign the deployer as contract owner", async function () {
      const { liquidity, owner } = await loadFixture(deployFixture);
      expect(await liquidity.owner()).to.equal(await owner.getAddress());
    });
  });

  describe("Parameter Management", function () {
    it("Should allow owner to update reward multiplier", async function () {
      const { liquidity, owner } = await loadFixture(deployFixture);
      await liquidity.connect(owner).updateMultiplier(2);
      expect(await liquidity.bonusMultiplier()).to.equal(2);
    });

    it("Should prevent non-owner from modifying reward multiplier", async function () {
      const { liquidity, notOwner } = await loadFixture(deployFixture);
      await expect(liquidity.connect(notOwner).updateMultiplier(2)).to.be
        .eventually.rejected;
    });

    // it("Should update starting timestamp", async function () {
    //   const { liquidity, owner, latestTime } = await loadFixture(deployFixture);
    //   await liquidity.connect(owner).updateStartTime(latestTime + 100);
    //   expect(await liquidity.startTime()).to.equal(latestTime + 100);
    // });

    it("Should prevent non-owner from modifying start time", async function () {
      const { liquidity, notOwner } = await loadFixture(deployFixture);
      await expect(liquidity.connect(notOwner).updateStartTime(2)).to.be
        .eventually.rejected;
    });
  });

  describe("Pool Information", function () {
    it("Should initialize with zero pools", async function () {
      const { liquidity } = await loadFixture(deployFixture);
      expect(await liquidity.poolLength()).to.equal(0);
    });
  });

  describe("Pool Management", function () {
    it("Should successfully create staking pool with correct settings", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOverlayerReferral } =
        await loadFixture(deployFixture);
      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        1
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
        1,
        0,
        false,
        true
      );
      expect(await liquidity.poolLength()).to.equal(1);
      await liquidity.setReward(stakedAsset.getAddress(), 1);
      await liquidity.add(
        tokenRewardOneOverlayerReferral.getAddress(),
        stakedAsset.getAddress(),
        1,
        0,
        false,
        true
      );
      expect(await liquidity.poolLength()).to.equal(2);
    });

    it("Should track allocation points correctly across multiple pools", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        tokenRewardTwo
      } = await loadFixture(deployFixture);
      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        1
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
        1,
        0,
        false,
        true
      );
      expect(await liquidity.poolLength()).to.equal(1);
      await liquidity.setReward(stakedAsset.getAddress(), 1);
      await liquidity.add(
        tokenRewardOneOverlayerReferral.getAddress(),
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
          tokenRewardOneOverlayerReferral.getAddress()
        )
      ).to.be.equal(1);
      expect(
        await liquidity.totalAllocPointsPerReward(stakedAsset.getAddress())
      ).to.be.equal(110);
    });

    it("Should restrict pool creation to owner only", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        notOwner
      } = await loadFixture(deployFixture);
      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        1
      );
      await expect(
        liquidity
          .connect(notOwner)
          .add(
            stakedAsset.getAddress(),
            tokenRewardOneOverlayerReferral.getAddress(),
            1,
            0,
            false,
            false
          )
      ).to.be.eventually.rejected;
    });
  });

  describe("Reward System", function () {
    it("Should enable reward token and set initial rate", async function () {
      const { liquidity, stakedAsset } = await loadFixture(deployFixture);
      await liquidity.setReward(stakedAsset.getAddress(), 1);
      expect(
        await liquidity.activeRewards(stakedAsset.getAddress())
      ).to.be.equal(true);
    });

    it("Should allow updating reward emission rate", async function () {
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

    it("Should restrict reward configuration to owner only", async function () {
      const { liquidity, stakedAsset, notOwner } = await loadFixture(
        deployFixture
      );
      await expect(
        liquidity.connect(notOwner).setReward(stakedAsset.getAddress(), 1)
      ).to.be.eventually.rejected;
    });
  });

  describe("Pool Configuration", function () {
    it("Should allow modifying pool allocation points", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOverlayerReferral } =
        await loadFixture(deployFixture);
      await liquidity.setReward(stakedAsset.getAddress(), 1);
      await liquidity.add(
        tokenRewardOneOverlayerReferral.getAddress(),
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

    it("Should restrict pool modifications to owner only", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        notOwner
      } = await loadFixture(deployFixture);
      await liquidity.setReward(stakedAsset.getAddress(), 1);
      await liquidity.add(
        tokenRewardOneOverlayerReferral.getAddress(),
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
    it("Should handle token deposits and approvals correctly", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
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

      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        1
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
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

    it("Should calculate time-bounded rewards accurately", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        alice,
        bob
      } = await loadFixture(deployFixture);

      const latestTime: number = await time.latest();
      await time.increaseTo(latestTime + 1);
      const amount = ethers.parseEther("1");
      await stakedAsset.transfer(alice.getAddress(), amount);
      await stakedAsset.connect(alice).approve(liquidity.getAddress(), amount);

      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        ethers.parseEther("1")
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
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
        await tokenRewardOneOverlayerReferral.balanceOf(alice.address)
      );
      expect(+rewardsBal).to.be.greaterThan(expected * 0.99);
      expect(+rewardsBal).to.be.lessThan(expected * 1.01);
    });

    it("Should enforce vesting restrictions on withdrawals", async function () {
      const { liquidity, stakedAsset, tokenRewardOneOverlayerReferral, alice } =
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

      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        1
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
        1,
        latestTime + 60 * 60 * 24 * 10,
        true,
        true
      );

      expect(
        await tokenRewardOneOverlayerReferral.balanceOf(alice.address)
      ).to.be.equal(0);
      await expect(await liquidity.connect(alice).deposit(0, amount)).to.emit(
        liquidity,
        "Deposit"
      );
      expect(
        await tokenRewardOneOverlayerReferral.balanceOf(alice.address)
      ).to.be.equal(0);

      await expect(liquidity.connect(alice).harvest(0)).to.be.not.eventually
        .rejected;
      await time.increaseTo(latestTime + 60 * 60 * 24 * 3);
      await expect(await liquidity.connect(alice).deposit(0, amount)).to.emit(
        liquidity,
        "Deposit"
      );
      // Sequental deposits should harvest before endTimestamp
      const firstBal = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      expect(firstBal).to.be.greaterThan(0);
      await expect(liquidity.connect(alice).withdraw(0, amount)).to.be
        .eventually.rejected;
      await time.increaseTo(latestTime + 60 * 60 * 24 * 10 + 1);
      await expect(await liquidity.connect(alice).withdraw(0, amount)).to.emit(
        liquidity,
        "Withdraw"
      );
      const secondBal = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      expect(secondBal).to.be.greaterThan(firstBal);
    });

    it("Should process referral bonuses correctly during operations", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
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

      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        1
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
        1,
        0,
        false,
        true
      );

      const referral = await tokenRewardOneOverlayerReferral.getAddress();
      // Make the liquidity contract an allowed referral tracker
      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addPointsTracker(await liquidity.getAddress());
      await liquidity.connect(owner).updateReferral(referral);

      // ReferralType.Team = 1
      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addCode("BOB", bob.address, 1);

      // Consume referral code
      await tokenRewardOneOverlayerReferral
        .connect(alice)
        .consumeReferral("BOB");
      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .consumeReferral("BOB");

      // Test an increasing amount of bonus payed out
      await expect(
        await liquidity.connect(alice).deposit(0, ethers.parseEther("2"))
      ).to.emit(liquidity, "Deposit");
      await expect(
        await liquidity.connect(owner).deposit(0, ethers.parseEther("2"))
      ).to.emit(liquidity, "Deposit");
      expect(
        await tokenRewardOneOverlayerReferral.balanceOf(alice.address)
      ).to.be.equal(0);
      expect(
        await tokenRewardOneOverlayerReferral.balanceOf(bob.address)
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
        await tokenRewardOneOverlayerReferral.balanceOf(alice.address)
      ).to.be.greaterThan(0);
      let bobBonus = await tokenRewardOneOverlayerReferral.balanceOf(
        bob.address
      );
      expect(bobBonus).to.be.greaterThan(0);
      await time.increaseTo((await time.latest()) + 60 * 60 * 24 * 10);
      await expect(
        await liquidity.connect(alice).deposit(0, ethers.parseEther("5"))
      ).to.emit(liquidity, "Deposit");
      expect(
        await tokenRewardOneOverlayerReferral.balanceOf(bob.address)
      ).to.be.greaterThan(bobBonus);
      bobBonus = await tokenRewardOneOverlayerReferral.balanceOf(bob.address);

      // Check total points generated from the referral source
      expect(
        await tokenRewardOneOverlayerReferral.generatedPoints(bob.address)
      ).to.be.greaterThan(0);

      // Check harvest do generate bonuses
      await time.increaseTo((await time.latest()) + 60 * 60 * 24 * 10);
      expect(await liquidity.connect(alice).harvest(0)).to.emit(
        liquidity,
        "SelfBonusPayed"
      );
      expect(
        await tokenRewardOneOverlayerReferral.balanceOf(bob.address)
      ).to.be.greaterThan(bobBonus);
      bobBonus = await tokenRewardOneOverlayerReferral.balanceOf(bob.address);

      // Check withdraw do generate bonuses
      await time.increaseTo((await time.latest()) + 60 * 60 * 24 * 10);
      expect(
        await liquidity.connect(alice).withdraw(0, ethers.parseEther("10"))
      ).to.emit(liquidity, "BonusPayed");
      expect(
        await tokenRewardOneOverlayerReferral.balanceOf(bob.address)
      ).to.be.greaterThan(bobBonus);
    });

    it("Should pay different referrer and self bonuses for type Team vs Ref", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        owner,
        alice,
        bob
      } = await loadFixture(deployFixture);
      const [, , , , carol] = await ethers.getSigners();

      const ReferralTypeTeam = 1;
      const ReferralTypeRef = 2;

      await stakedAsset.transfer(alice.getAddress(), ethers.parseEther("10"));
      await stakedAsset.transfer(carol.getAddress(), ethers.parseEther("10"));
      await stakedAsset
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.parseEther("10"));
      await stakedAsset
        .connect(carol)
        .approve(liquidity.getAddress(), ethers.parseEther("10"));

      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        1
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
        1,
        0,
        false,
        true
      );

      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addPointsTracker(await liquidity.getAddress());
      await liquidity
        .connect(owner)
        .updateReferral(await tokenRewardOneOverlayerReferral.getAddress());

      // Team: 5% referrer / 2.5% self (defaults). Ref: 10% referrer / 5% self.
      await liquidity.connect(owner).updateReferralBonus(ReferralTypeRef, 10);
      await liquidity
        .connect(owner)
        .updateSelfReferralBonus(ReferralTypeRef, 50);

      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addCode("BOB_TEAM", bob.address, ReferralTypeTeam);
      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addCode("BOB_REF", bob.address, ReferralTypeRef);

      await tokenRewardOneOverlayerReferral
        .connect(alice)
        .consumeReferral("BOB_TEAM");
      await tokenRewardOneOverlayerReferral
        .connect(carol)
        .consumeReferral("BOB_REF");

      await liquidity.connect(alice).deposit(0, ethers.parseEther("5"));
      await liquidity.connect(carol).deposit(0, ethers.parseEther("5"));

      await time.increaseTo((await time.latest()) + 60 * 60 * 24);

      const pendingAlice = await liquidity.pendingReward(0, alice.address);
      const pendingCarol = await liquidity.pendingReward(0, carol.address);
      // Equal stake / time => equal pending base rewards
      expect(pendingAlice).to.equal(pendingCarol);

      const bobBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        bob.address
      );
      const aliceBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const carolBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        carol.address
      );

      await liquidity.connect(alice).harvest(0);
      const bobAfterA = await tokenRewardOneOverlayerReferral.balanceOf(
        bob.address
      );
      const aliceAfter = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const bobGainA = bobAfterA - bobBefore;
      const aliceSelfGain = aliceAfter - aliceBefore - pendingAlice;

      await liquidity.connect(carol).harvest(0);
      const bobAfterB = await tokenRewardOneOverlayerReferral.balanceOf(
        bob.address
      );
      const carolAfter = await tokenRewardOneOverlayerReferral.balanceOf(
        carol.address
      );
      const bobGainB = bobAfterB - bobAfterA;
      const carolSelfGain = carolAfter - carolBefore - pendingCarol;

      // Referrer: Ref (10%) > Team (5%)
      expect(bobGainB).to.be.greaterThan(bobGainA);
      expect(bobGainA).to.equal((pendingAlice * 5n) / 100n);
      expect(bobGainB).to.equal((pendingCarol * 10n) / 100n);

      // Self: Ref (5%) > Team (2.5%)
      expect(carolSelfGain).to.be.greaterThan(aliceSelfGain);
      expect(aliceSelfGain).to.equal((pendingAlice * 25n) / 1000n);
      expect(carolSelfGain).to.equal((pendingCarol * 50n) / 1000n);
    });

    it("Should calculate pending rewards accurately over time", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        alice,
        bob
      } = await loadFixture(deployFixture);
      const users: Array<any> = [alice, bob];
      const PARTICIPATION: string = "10";
      const TOTAL_PARTICIPATION: string = (
        users.length * +PARTICIPATION
      ).toString();
      const REWARD_PER_SECOND: string = "1";

      const lastestTime = await time.latest();
      await time.increaseTo(lastestTime + 1);
      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        ethers.parseEther(REWARD_PER_SECOND)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
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

    it("Should distribute rewards proportionally based on stake weights", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        tokenRewardTwo,
        alice,
        bob
      } = await loadFixture(deployFixture);
      const PARTICIPATION: string = "10";
      const REWARD_PER_SECOND: string = "1";

      const latestTime: number = await time.latest();
      await time.increaseTo(latestTime + 1);
      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        ethers.parseEther(REWARD_PER_SECOND)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
        1000,
        0,
        false,
        true
      );
      await liquidity.add(
        tokenRewardTwo.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
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

    it("Should distribute equal rewards for equal stakes and time", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        alice,
        bob
      } = await loadFixture(deployFixture);
      const users: Array<any> = [alice, bob];
      const PARTICIPATION: string = "10";
      const TOTAL_PARTICIPATION: string = (
        users.length * +PARTICIPATION
      ).toString();
      const REWARD_PER_SECOND: string = "1";

      const latestTime: number = await time.latest();
      await time.increaseTo(latestTime + 1);
      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        ethers.parseEther(REWARD_PER_SECOND)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
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
      const aliceReward = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.getAddress()
      );
      const bobReward = await tokenRewardOneOverlayerReferral.balanceOf(
        bob.getAddress()
      );
      assert.isTrue(
        ethers.formatEther(aliceReward) === ethers.formatEther(bobReward)
      );
    });

    it("Should distribute proportional rewards for unequal stakes", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        alice,
        bob
      } = await loadFixture(deployFixture);
      const PARTICIPATION: string = "10";
      const HALF_PARTICIPATION: string = "5";
      const TOTAL_PARTICIPATION: string = "15";
      const REWARD_PER_SECOND: string = "1";

      const latestTime: number = await time.latest();
      await time.increaseTo(latestTime + 1);
      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        ethers.parseEther(REWARD_PER_SECOND)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
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
      const aliceReward = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.getAddress()
      );
      const bobReward = await tokenRewardOneOverlayerReferral.balanceOf(
        bob.getAddress()
      );
      assert.isTrue(
        +(+ethers.formatEther(aliceReward)).toFixed(1) === expectedAliceReward
      );
      assert.isTrue(
        +(+ethers.formatEther(bobReward)).toFixed(1) * 2 === expectedBobReward
      );
    });

    it("Should track and distribute harvest rewards correctly", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        alice,
        bob
      } = await loadFixture(deployFixture);
      const users: Array<any> = [alice, bob];
      const PARTICIPATION: string = "10";
      const TOTAL_PARTICIPATION: string = (
        users.length * +PARTICIPATION
      ).toString();
      const REWARD_PER_SECOND: string = "1";

      const latestTime: number = await time.latest();
      await time.increaseTo(latestTime + 1);
      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        ethers.parseEther(REWARD_PER_SECOND)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
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
        await tokenRewardOneOverlayerReferral.balanceOf(alice.getAddress())
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
        await tokenRewardOneOverlayerReferral.balanceOf(bob.getAddress())
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
        await tokenRewardOneOverlayerReferral.balanceOf(alice.getAddress())
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

    it("Should enforce deposit limits and prevent excess withdrawals", async function () {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        alice,
        bob
      } = await loadFixture(deployFixture);

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

      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        1
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
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
      let aliceReward = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.getAddress()
      );
      let bobReward = await tokenRewardOneOverlayerReferral.balanceOf(
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

  describe("NFT Staking Bonus", function () {
    async function deployNftFixture() {
      const base = await deployFixture();
      const { liquidity, owner, alice } = base;

      const BonusNFT = await ethers.getContractFactory("BonusNFTMock");
      const shrimpNft = await BonusNFT.deploy("Shrimp", "SHRIMP", 2, 100);
      const dolphinNft = await BonusNFT.deploy("Dolphin", "DOLPHIN", 6, 100);
      const whaleNft = await BonusNFT.deploy("Whale", "WHALE", 11, 100);
      const bonusA = await BonusNFT.deploy("BonusA", "BA", 3, 100);
      const bonusB = await BonusNFT.deploy("BonusB", "BB", 4, 100);

      await liquidity
        .connect(owner)
        .setOriginNfts(
          await shrimpNft.getAddress(),
          await dolphinNft.getAddress(),
          await whaleNft.getAddress()
        );
      await liquidity
        .connect(owner)
        .setWhitelistedNft(await bonusA.getAddress(), true);
      await liquidity
        .connect(owner)
        .setWhitelistedNft(await bonusB.getAddress(), true);

      await shrimpNft.connect(alice).mint(alice.address);
      await dolphinNft.connect(alice).mint(alice.address);
      await whaleNft.connect(alice).mint(alice.address);
      await bonusA.connect(alice).mint(alice.address);
      await bonusB.connect(alice).mint(alice.address);

      return {
        ...base,
        shrimpNft,
        dolphinNft,
        whaleNft,
        bonusA,
        bonusB,
        shrimpTokenId: 1n,
        dolphinTokenId: 1n,
        whaleTokenId: 1n,
        bonusATokenId: 1n,
        bonusBTokenId: 1n
      };
    }

    async function setupPoolWithDeposit(
      fixture: Awaited<ReturnType<typeof deployNftFixture>>
    ) {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        owner,
        alice
      } = fixture;

      await stakedAsset.transfer(alice.getAddress(), ethers.parseEther("100"));
      await stakedAsset
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.parseEther("100"));

      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        100
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
        1,
        0,
        false,
        true
      );
      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addPointsTracker(await liquidity.getAddress());

      await liquidity.connect(alice).deposit(0, ethers.parseEther("10"));
    }

    it("Should stake and unstake an Origin NFT", async function () {
      const { liquidity, shrimpNft, alice, shrimpTokenId } = await loadFixture(
        deployNftFixture
      );

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);

      await expect(
        liquidity
          .connect(alice)
          .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId)
      )
        .to.emit(liquidity, "OriginNftStaked")
        .withArgs(alice.address, await shrimpNft.getAddress(), shrimpTokenId);

      expect(await shrimpNft.ownerOf(shrimpTokenId)).to.equal(
        await liquidity.getAddress()
      );
      const [collection, tokenId] = await liquidity.originStakeOf(
        alice.address
      );
      expect(collection).to.equal(await shrimpNft.getAddress());
      expect(tokenId).to.equal(shrimpTokenId);

      await expect(liquidity.connect(alice).unstakeOriginNft())
        .to.emit(liquidity, "OriginNftUnstaked")
        .withArgs(alice.address, await shrimpNft.getAddress(), shrimpTokenId);

      expect(await shrimpNft.ownerOf(shrimpTokenId)).to.equal(alice.address);
      const [clearedCollection] = await liquidity.originStakeOf(alice.address);
      expect(clearedCollection).to.equal(ethers.ZeroAddress);
    });

    it("Should allow only one Origin NFT at a time", async function () {
      const {
        liquidity,
        shrimpNft,
        dolphinNft,
        alice,
        shrimpTokenId,
        dolphinTokenId
      } = await loadFixture(deployNftFixture);

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await dolphinNft
        .connect(alice)
        .approve(await liquidity.getAddress(), dolphinTokenId);

      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);

      await expect(
        liquidity
          .connect(alice)
          .stakeOriginNft(await dolphinNft.getAddress(), dolphinTokenId)
      ).to.be.revertedWithCustomError(liquidity, "OriginAlreadyStaked");
    });

    it("Should reject non-Origin collections for Origin staking", async function () {
      const { liquidity, bonusA, alice, bonusATokenId } = await loadFixture(
        deployNftFixture
      );

      await bonusA
        .connect(alice)
        .approve(await liquidity.getAddress(), bonusATokenId);

      await expect(
        liquidity
          .connect(alice)
          .stakeOriginNft(await bonusA.getAddress(), bonusATokenId)
      ).to.be.revertedWithCustomError(liquidity, "InvalidOriginNft");
    });

    it("Should pay Origin NFT bonus on harvest", async function () {
      const fixture = await loadFixture(deployNftFixture);
      const {
        liquidity,
        shrimpNft,
        tokenRewardOneOverlayerReferral,
        alice,
        shrimpTokenId
      } = fixture;
      await setupPoolWithDeposit(fixture);

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);

      await time.increase(1000);

      const balBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const tx = await liquidity.connect(alice).harvest(0);
      const receipt = await tx.wait();
      const harvestLog = receipt!.logs
        .map((log: any) => {
          try {
            return liquidity.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed: any) => parsed?.name === "Harvest");
      const pending = harvestLog!.args.amount as bigint;
      const expectedNftBonus = (pending * 2n) / 100n;

      await expect(tx).to.emit(liquidity, "NftBonusPayed");
      const balAfter = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );

      expect(balAfter - balBefore).to.equal(pending + expectedNftBonus);
      expect(await liquidity.nftBonusOf(alice.address, pending)).to.equal(
        expectedNftBonus
      );
    });

    it("Should harvest before Origin stake so old pending is unpaid at new rate", async function () {
      const fixture = await loadFixture(deployNftFixture);
      const {
        liquidity,
        shrimpNft,
        tokenRewardOneOverlayerReferral,
        alice,
        shrimpTokenId
      } = fixture;
      await setupPoolWithDeposit(fixture);

      await time.increase(1000);

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);

      const balBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      // stakeOriginNft harvests first without NFT bonus
      const stakeTx = await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);
      await expect(stakeTx).to.not.emit(liquidity, "NftBonusPayed");
      const balAfterStake = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      // Base rewards were paid (pending accrued before stake)
      expect(balAfterStake).to.be.greaterThan(balBefore);

      await time.increase(1000);
      const balMid = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const harvestTx = await liquidity.connect(alice).harvest(0);
      const receipt = await harvestTx.wait();
      const harvestLog = receipt!.logs
        .map((log: any) => {
          try {
            return liquidity.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed: any) => parsed?.name === "Harvest");
      const pendingAfter = harvestLog!.args.amount as bigint;
      const expectedNftBonus = (pendingAfter * 2n) / 100n;
      const balFinal = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      expect(balFinal - balMid).to.equal(pendingAfter + expectedNftBonus);
    });

    it("Should sum multiple whitelisted NFT bonuses", async function () {
      const fixture = await loadFixture(deployNftFixture);
      const {
        liquidity,
        bonusA,
        bonusB,
        tokenRewardOneOverlayerReferral,
        alice,
        bonusATokenId,
        bonusBTokenId
      } = fixture;
      await setupPoolWithDeposit(fixture);

      await bonusA
        .connect(alice)
        .approve(await liquidity.getAddress(), bonusATokenId);
      await bonusB
        .connect(alice)
        .approve(await liquidity.getAddress(), bonusBTokenId);

      await liquidity
        .connect(alice)
        .stakeWhitelistedNft(await bonusA.getAddress(), bonusATokenId);
      await liquidity
        .connect(alice)
        .stakeWhitelistedNft(await bonusB.getAddress(), bonusBTokenId);

      const stakes = await liquidity.whitelistedStakesOf(alice.address);
      expect(stakes.length).to.equal(2);

      await time.increase(1000);
      const balBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const tx = await liquidity.connect(alice).harvest(0);
      const receipt = await tx.wait();
      const harvestLog = receipt!.logs
        .map((log: any) => {
          try {
            return liquidity.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed: any) => parsed?.name === "Harvest");
      const pending = harvestLog!.args.amount as bigint;
      // 3% + 4% = 7%
      const expectedNftBonus = (pending * 7n) / 100n;
      const balAfter = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      expect(balAfter - balBefore).to.equal(pending + expectedNftBonus);
    });

    it("Should combine self-referral and NFT bonuses", async function () {
      const fixture = await loadFixture(deployNftFixture);
      const {
        liquidity,
        shrimpNft,
        tokenRewardOneOverlayerReferral,
        owner,
        alice,
        bob,
        shrimpTokenId
      } = fixture;
      await setupPoolWithDeposit(fixture);

      await liquidity
        .connect(owner)
        .updateReferral(await tokenRewardOneOverlayerReferral.getAddress());
      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addCode("BOB", bob.address, 1); // ReferralType.Team
      await tokenRewardOneOverlayerReferral
        .connect(alice)
        .consumeReferral("BOB");

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);

      await time.increase(1000);
      const aliceBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const bobBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        bob.address
      );

      const tx = await liquidity.connect(alice).harvest(0);
      const receipt = await tx.wait();
      const harvestLog = receipt!.logs
        .map((log: any) => {
          try {
            return liquidity.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed: any) => parsed?.name === "Harvest");
      const pending = harvestLog!.args.amount as bigint;
      const selfBonus = (pending * 25n) / 1000n; // 2.5%
      const nftBonus = (pending * 2n) / 100n; // 2%
      const referrerBonus = (pending * 5n) / 100n; // 5%

      const aliceAfter = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const bobAfter = await tokenRewardOneOverlayerReferral.balanceOf(
        bob.address
      );

      expect(aliceAfter - aliceBefore).to.equal(pending + selfBonus + nftBonus);
      expect(bobAfter - bobBefore).to.equal(referrerBonus);
    });

    it("Should apply one Origin stake across all pool ids", async function () {
      const fixture = await loadFixture(deployNftFixture);
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        shrimpNft,
        owner,
        alice,
        shrimpTokenId
      } = fixture;

      const StakedAsset = await ethers.getContractFactory("TokenLP_A_B");
      const stakedAssetTwo = await StakedAsset.deploy(
        ethers.parseEther("1000"),
        "LPABTWO",
        "LPABTWO"
      );

      await stakedAsset.transfer(alice.getAddress(), ethers.parseEther("50"));
      await stakedAssetTwo.transfer(
        alice.getAddress(),
        ethers.parseEther("50")
      );
      await stakedAsset
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.parseEther("50"));
      await stakedAssetTwo
        .connect(alice)
        .approve(liquidity.getAddress(), ethers.parseEther("50"));

      await liquidity.setReward(
        tokenRewardOneOverlayerReferral.getAddress(),
        100
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
        1,
        0,
        false,
        true
      );
      await liquidity.add(
        stakedAssetTwo.getAddress(),
        tokenRewardOneOverlayerReferral.getAddress(),
        1,
        0,
        false,
        true
      );
      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addPointsTracker(await liquidity.getAddress());

      await liquidity.connect(alice).deposit(0, ethers.parseEther("10"));
      await liquidity.connect(alice).deposit(1, ethers.parseEther("10"));

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);

      await time.increase(1000);
      const balBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );

      const tx0 = await liquidity.connect(alice).harvest(0);
      const receipt0 = await tx0.wait();
      const harvest0 = receipt0!.logs
        .map((log: any) => {
          try {
            return liquidity.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed: any) => parsed?.name === "Harvest");
      const pending0 = harvest0!.args.amount as bigint;

      const tx1 = await liquidity.connect(alice).harvest(1);
      const receipt1 = await tx1.wait();
      const harvest1 = receipt1!.logs
        .map((log: any) => {
          try {
            return liquidity.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed: any) => parsed?.name === "Harvest");
      const pending1 = harvest1!.args.amount as bigint;

      const balAfter = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );

      const expected =
        pending0 + (pending0 * 2n) / 100n + pending1 + (pending1 * 2n) / 100n;
      expect(balAfter - balBefore).to.equal(expected);
    });

    it("Should allow owner to add and remove whitelisted NFTs", async function () {
      const { liquidity, owner, notOwner } = await loadFixture(
        deployNftFixture
      );
      const BonusNFT = await ethers.getContractFactory("BonusNFTMock");
      const bonusC = await BonusNFT.deploy("BonusC", "BC", 5, 100);

      await expect(
        liquidity
          .connect(notOwner)
          .setWhitelistedNft(await bonusC.getAddress(), true)
      ).to.be.eventually.rejected;

      await expect(
        liquidity
          .connect(owner)
          .setWhitelistedNft(await bonusC.getAddress(), true)
      )
        .to.emit(liquidity, "WhitelistedNftUpdated")
        .withArgs(await bonusC.getAddress(), true);

      expect(
        await liquidity.whitelistedNft(await bonusC.getAddress())
      ).to.equal(true);

      await liquidity
        .connect(owner)
        .setWhitelistedNft(await bonusC.getAddress(), false);
      expect(
        await liquidity.whitelistedNft(await bonusC.getAddress())
      ).to.equal(false);
    });

    it("Should unstake whitelisted NFT after delist", async function () {
      const fixture = await loadFixture(deployNftFixture);
      const { liquidity, bonusA, owner, alice, bonusATokenId } = fixture;

      await bonusA
        .connect(alice)
        .approve(await liquidity.getAddress(), bonusATokenId);
      await liquidity
        .connect(alice)
        .stakeWhitelistedNft(await bonusA.getAddress(), bonusATokenId);

      await liquidity
        .connect(owner)
        .setWhitelistedNft(await bonusA.getAddress(), false);

      await expect(
        liquidity
          .connect(alice)
          .unstakeWhitelistedNft(await bonusA.getAddress(), bonusATokenId)
      )
        .to.emit(liquidity, "WhitelistedNftUnstaked")
        .withArgs(alice.address, await bonusA.getAddress(), bonusATokenId);

      expect(await bonusA.ownerOf(bonusATokenId)).to.equal(alice.address);
    });
  });

  describe("NFT Bonus Accounting", function () {
    const REWARD_PER_SECOND = 1_000n;

    function mulDiv(a: bigint, b: bigint, c: bigint): bigint {
      return (a * b) / c;
    }

    function parseLiquidityLogs(liquidity: any, receipt: any) {
      return receipt.logs
        .map((log: any) => {
          try {
            return liquidity.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }

    function eventAmount(parsedLogs: any[], name: string): bigint {
      const found = parsedLogs.find((p) => p.name === name);
      expect(found, `missing event ${name}`).to.not.equal(undefined);
      return found.args.amount as bigint;
    }

    function optionalEventAmount(
      parsedLogs: any[],
      name: string
    ): bigint | undefined {
      const found = parsedLogs.find((p) => p.name === name);
      return found ? (found.args.amount as bigint) : undefined;
    }

    function eventAmountForType(
      parsedLogs: any[],
      name: string,
      referralType: bigint
    ): bigint {
      const found = parsedLogs.find(
        (p) => p.name === name && BigInt(p.args.referralType) === referralType
      );
      expect(found, `missing event ${name} type ${referralType}`).to.not.equal(
        undefined
      );
      return found.args.amount as bigint;
    }

    function sumEventAmounts(parsedLogs: any[], name: string): bigint {
      return parsedLogs
        .filter((p) => p.name === name)
        .reduce((acc, p) => acc + (p.args.amount as bigint), 0n);
    }

    async function deployAccountingFixture() {
      const base = await deployFixture();
      const { liquidity, owner, alice, bob } = base;

      const BonusNFT = await ethers.getContractFactory("BonusNFTMock");
      // Origin tiers
      const shrimpNft = await BonusNFT.deploy("Shrimp", "SHRIMP", 2, 100);
      const dolphinNft = await BonusNFT.deploy("Dolphin", "DOLPHIN", 6, 100);
      const whaleNft = await BonusNFT.deploy("Whale", "WHALE", 11, 100);
      // Whitelist with mixed denominators for rounding tests
      const bonusPct = await BonusNFT.deploy("BonusPct", "BP", 3, 100); // 3%
      const bonusThird = await BonusNFT.deploy("BonusThird", "BT", 1, 3); // 1/3
      const bonusSeventh = await BonusNFT.deploy("BonusSeventh", "BS", 1, 7); // 1/7
      const bonusZero = await BonusNFT.deploy("BonusZero", "BZ", 0, 100); // 0%
      const ogNft = await BonusNFT.deploy("OG", "OG", 0, 100);

      await liquidity
        .connect(owner)
        .setOriginNfts(
          await shrimpNft.getAddress(),
          await dolphinNft.getAddress(),
          await whaleNft.getAddress()
        );
      await liquidity.connect(owner).setOgNft(await ogNft.getAddress());
      for (const nft of [bonusPct, bonusThird, bonusSeventh, bonusZero]) {
        await liquidity
          .connect(owner)
          .setWhitelistedNft(await nft.getAddress(), true);
      }

      await shrimpNft.connect(alice).mint(alice.address);
      await whaleNft.connect(alice).mint(alice.address);
      await bonusPct.connect(alice).mint(alice.address);
      await bonusPct.connect(alice).mint(alice.address); // tokenId 2, same collection
      await bonusThird.connect(alice).mint(alice.address);
      await bonusSeventh.connect(alice).mint(alice.address);
      await bonusZero.connect(alice).mint(alice.address);
      // OG minted to alice only in tests that need it

      // Second shrimp for bob (harvestFor tests)
      await shrimpNft.connect(bob).mint(bob.address);

      return {
        ...base,
        shrimpNft,
        dolphinNft,
        whaleNft,
        bonusPct,
        bonusThird,
        bonusSeventh,
        bonusZero,
        ogNft,
        shrimpTokenId: 1n,
        whaleTokenId: 1n,
        bobShrimpTokenId: 2n,
        bonusPctTokenId: 1n,
        bonusPctTokenId2: 2n,
        bonusThirdTokenId: 1n,
        bonusSeventhTokenId: 1n,
        bonusZeroTokenId: 1n
      };
    }

    async function setupSoleStakerPool(
      fixture: Awaited<ReturnType<typeof deployAccountingFixture>>,
      opts?: { secondPool?: boolean; skipDeposit?: boolean }
    ) {
      const {
        liquidity,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        owner,
        alice
      } = fixture;

      await stakedAsset.transfer(alice.address, ethers.parseEther("1000"));
      await stakedAsset
        .connect(alice)
        .approve(await liquidity.getAddress(), ethers.parseEther("1000"));

      await liquidity.setReward(
        await tokenRewardOneOverlayerReferral.getAddress(),
        REWARD_PER_SECOND
      );
      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addPointsTracker(await liquidity.getAddress());

      await liquidity.add(
        await stakedAsset.getAddress(),
        await tokenRewardOneOverlayerReferral.getAddress(),
        1,
        0,
        false,
        true
      );

      let stakedAssetTwo: any;
      if (opts?.secondPool) {
        const StakedAsset = await ethers.getContractFactory("TokenLP_A_B");
        stakedAssetTwo = await StakedAsset.deploy(
          ethers.parseEther("1000"),
          "LP2",
          "LP2"
        );
        await stakedAssetTwo.transfer(alice.address, ethers.parseEther("1000"));
        await stakedAssetTwo
          .connect(alice)
          .approve(await liquidity.getAddress(), ethers.parseEther("1000"));
        await liquidity.add(
          await stakedAssetTwo.getAddress(),
          await tokenRewardOneOverlayerReferral.getAddress(),
          1,
          0,
          false,
          true
        );
      }

      if (!opts?.skipDeposit) {
        await liquidity.connect(alice).deposit(0, ethers.parseEther("100"));
        if (opts?.secondPool) {
          await liquidity.connect(alice).deposit(1, ethers.parseEther("100"));
        }
      }

      return { stakedAssetTwo };
    }

    it("pendingReward stays base-only while nftBonusOf matches staked fractions", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        shrimpNft,
        bonusPct,
        alice,
        shrimpTokenId,
        bonusPctTokenId
      } = fixture;
      await setupSoleStakerPool(fixture);

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await bonusPct
        .connect(alice)
        .approve(await liquidity.getAddress(), bonusPctTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeWhitelistedNft(await bonusPct.getAddress(), bonusPctTokenId);

      await time.increase(500);
      const pending = await liquidity.pendingReward(0, alice.address);
      expect(pending).to.be.greaterThan(0n);

      // pendingReward must NOT include NFT bonus
      const expectedNft = mulDiv(pending, 2n, 100n) + mulDiv(pending, 3n, 100n);
      expect(await liquidity.nftBonusOf(alice.address, pending)).to.equal(
        expectedNft
      );
      // View consistency: applying bonus off-chain is strictly additive to base pending
      expect(pending + expectedNft).to.be.greaterThan(pending);
      expect(
        await liquidity.pendingRewardWithNftBonus(0, alice.address)
      ).to.equal(pending + expectedNft);
    });

    it("pays exact Origin bonus on harvest from Harvest amount", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        shrimpNft,
        tokenRewardOneOverlayerReferral,
        alice,
        shrimpTokenId
      } = fixture;
      await setupSoleStakerPool(fixture);

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);

      await time.increase(1_000);
      const before = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const tx = await liquidity.connect(alice).harvest(0);
      const logs = parseLiquidityLogs(liquidity, await tx.wait());
      const base = eventAmount(logs, "Harvest");
      const nftBonus = eventAmount(logs, "NftBonusPayed");

      expect(nftBonus).to.equal(mulDiv(base, 2n, 100n));
      expect(await liquidity.nftBonusOf(alice.address, base)).to.equal(
        nftBonus
      );
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(alice.address)) -
          before
      ).to.equal(base + nftBonus);
    });

    it("pays exact NFT bonus on deposit harvest path", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        shrimpNft,
        tokenRewardOneOverlayerReferral,
        alice,
        shrimpTokenId
      } = fixture;
      await setupSoleStakerPool(fixture);

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);

      await time.increase(750);
      const before = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      // deposit(0) harvests pending then adds zero stake amount change path with extra deposit
      const tx = await liquidity
        .connect(alice)
        .deposit(0, ethers.parseEther("1"));
      const logs = parseLiquidityLogs(liquidity, await tx.wait());
      // Deposit does not emit Harvest; reconstruct from balance + known bonus formula via NftBonusPayed
      const nftBonus = eventAmount(logs, "NftBonusPayed");
      const after = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const totalPaid = after - before;
      // totalPaid = base + nftBonus => base = totalPaid - nftBonus
      const base = totalPaid - nftBonus;
      expect(nftBonus).to.equal(mulDiv(base, 2n, 100n));
      expect(base).to.be.greaterThan(0n);
    });

    it("pays exact NFT bonus on withdraw harvest path", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        shrimpNft,
        tokenRewardOneOverlayerReferral,
        alice,
        shrimpTokenId
      } = fixture;
      await setupSoleStakerPool(fixture);

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);

      await time.increase(640);
      const before = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const tx = await liquidity
        .connect(alice)
        .withdraw(0, ethers.parseEther("1"));
      const logs = parseLiquidityLogs(liquidity, await tx.wait());
      const nftBonus = eventAmount(logs, "NftBonusPayed");
      const after = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const totalPaid = after - before;
      const base = totalPaid - nftBonus;
      expect(nftBonus).to.equal(mulDiv(base, 2n, 100n));
      expect(base).to.be.greaterThan(0n);
    });

    it("sums Origin and whitelist bonuses additively (2% + 3%)", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        shrimpNft,
        bonusPct,
        tokenRewardOneOverlayerReferral,
        alice,
        shrimpTokenId,
        bonusPctTokenId
      } = fixture;
      await setupSoleStakerPool(fixture);

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await bonusPct
        .connect(alice)
        .approve(await liquidity.getAddress(), bonusPctTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeWhitelistedNft(await bonusPct.getAddress(), bonusPctTokenId);

      await time.increase(900);
      const before = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const tx = await liquidity.connect(alice).harvest(0);
      const logs = parseLiquidityLogs(liquidity, await tx.wait());
      const base = eventAmount(logs, "Harvest");
      const nftBonus = eventAmount(logs, "NftBonusPayed");

      expect(nftBonus).to.equal(
        mulDiv(base, 2n, 100n) + mulDiv(base, 3n, 100n)
      );
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(alice.address)) -
          before
      ).to.equal(base + nftBonus);
    });

    it("floors each collection bonus independently with mixed denominators", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        bonusThird,
        bonusSeventh,
        tokenRewardOneOverlayerReferral,
        alice,
        bonusThirdTokenId,
        bonusSeventhTokenId
      } = fixture;
      await setupSoleStakerPool(fixture);

      await bonusThird
        .connect(alice)
        .approve(await liquidity.getAddress(), bonusThirdTokenId);
      await bonusSeventh
        .connect(alice)
        .approve(await liquidity.getAddress(), bonusSeventhTokenId);
      await liquidity
        .connect(alice)
        .stakeWhitelistedNft(await bonusThird.getAddress(), bonusThirdTokenId);
      await liquidity
        .connect(alice)
        .stakeWhitelistedNft(
          await bonusSeventh.getAddress(),
          bonusSeventhTokenId
        );

      // Use a base that is not divisible by 3 or 7 to expose flooring
      await time.increase(1_001);
      const tx = await liquidity.connect(alice).harvest(0);
      const logs = parseLiquidityLogs(liquidity, await tx.wait());
      const base = eventAmount(logs, "Harvest");
      const nftBonus = eventAmount(logs, "NftBonusPayed");

      const expected = mulDiv(base, 1n, 3n) + mulDiv(base, 1n, 7n);
      expect(nftBonus).to.equal(expected);
      expect(await liquidity.nftBonusOf(alice.address, base)).to.equal(
        expected
      );

      // Per-collection floor can diverge from floor of summed fraction
      const crafted = 5n;
      expect(await liquidity.nftBonusOf(alice.address, crafted)).to.equal(
        mulDiv(crafted, 1n, 3n) + mulDiv(crafted, 1n, 7n)
      ); // 1 + 0 = 1
      expect(await liquidity.nftBonusOf(alice.address, crafted)).to.not.equal(
        mulDiv(crafted, 10n, 21n)
      ); // floor(50/21)=2
      expect(
        await tokenRewardOneOverlayerReferral.balanceOf(alice.address)
      ).to.be.greaterThan(0n);
    });

    it("counts two tokens from the same collection twice", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const { liquidity, bonusPct, alice, bonusPctTokenId, bonusPctTokenId2 } =
        fixture;
      await setupSoleStakerPool(fixture);

      await bonusPct
        .connect(alice)
        .approve(await liquidity.getAddress(), bonusPctTokenId);
      await bonusPct
        .connect(alice)
        .approve(await liquidity.getAddress(), bonusPctTokenId2);
      await liquidity
        .connect(alice)
        .stakeWhitelistedNft(await bonusPct.getAddress(), bonusPctTokenId);
      await liquidity
        .connect(alice)
        .stakeWhitelistedNft(await bonusPct.getAddress(), bonusPctTokenId2);

      await time.increase(400);
      const tx = await liquidity.connect(alice).harvest(0);
      const logs = parseLiquidityLogs(liquidity, await tx.wait());
      const base = eventAmount(logs, "Harvest");
      const nftBonus = eventAmount(logs, "NftBonusPayed");
      // 3% + 3% = 6%
      expect(nftBonus).to.equal(
        mulDiv(base, 3n, 100n) + mulDiv(base, 3n, 100n)
      );
      expect(await liquidity.nftBonusOf(alice.address, base)).to.equal(
        nftBonus
      );
    });

    it("zero-numerator NFT pays no NFT bonus", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        bonusZero,
        tokenRewardOneOverlayerReferral,
        alice,
        bonusZeroTokenId
      } = fixture;
      await setupSoleStakerPool(fixture);

      await bonusZero
        .connect(alice)
        .approve(await liquidity.getAddress(), bonusZeroTokenId);
      await liquidity
        .connect(alice)
        .stakeWhitelistedNft(await bonusZero.getAddress(), bonusZeroTokenId);

      await time.increase(300);
      const before = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const tx = await liquidity.connect(alice).harvest(0);
      const logs = parseLiquidityLogs(liquidity, await tx.wait());
      const base = eventAmount(logs, "Harvest");
      expect(optionalEventAmount(logs, "NftBonusPayed")).to.equal(undefined);
      expect(await liquidity.nftBonusOf(alice.address, base)).to.equal(0n);
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(alice.address)) -
          before
      ).to.equal(base);
    });

    it("zero pending harvest pays neither base nor NFT bonus", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        shrimpNft,
        tokenRewardOneOverlayerReferral,
        alice,
        shrimpTokenId
      } = fixture;
      await setupSoleStakerPool(fixture);

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);

      // Clear any dust by harvesting once, then harvest again immediately
      await time.increase(10);
      await liquidity.connect(alice).harvest(0);
      const before = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const tx = await liquidity.connect(alice).harvest(0);
      const logs = parseLiquidityLogs(liquidity, await tx.wait());
      const base = eventAmount(logs, "Harvest");
      // At most one second of accrual from the harvest tx itself
      if (base === 0n) {
        expect(optionalEventAmount(logs, "NftBonusPayed")).to.equal(undefined);
        expect(
          await tokenRewardOneOverlayerReferral.balanceOf(alice.address)
        ).to.equal(before);
      } else {
        expect(eventAmount(logs, "NftBonusPayed")).to.equal(
          mulDiv(base, 2n, 100n)
        );
      }
    });

    it("drops NFT bonus after unstake for subsequent accrual only", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        shrimpNft,
        tokenRewardOneOverlayerReferral,
        alice,
        shrimpTokenId
      } = fixture;
      await setupSoleStakerPool(fixture);

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);

      await time.increase(500);
      const harvestWithBonus = await liquidity.connect(alice).harvest(0);
      const logsWith = parseLiquidityLogs(
        liquidity,
        await harvestWithBonus.wait()
      );
      const baseWith = eventAmount(logsWith, "Harvest");
      expect(eventAmount(logsWith, "NftBonusPayed")).to.equal(
        mulDiv(baseWith, 2n, 100n)
      );

      await time.increase(200);
      // Unstake harvests remaining pending STILL with NFT bonus, then clears stake
      const unstakeTx = await liquidity.connect(alice).unstakeOriginNft();
      const unstakeLogs = parseLiquidityLogs(liquidity, await unstakeTx.wait());
      const baseUnstake = eventAmount(unstakeLogs, "Harvest");
      expect(eventAmount(unstakeLogs, "NftBonusPayed")).to.equal(
        mulDiv(baseUnstake, 2n, 100n)
      );

      await time.increase(300);
      const before = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const harvestNoBonus = await liquidity.connect(alice).harvest(0);
      const logsNo = parseLiquidityLogs(liquidity, await harvestNoBonus.wait());
      const baseNo = eventAmount(logsNo, "Harvest");
      expect(optionalEventAmount(logsNo, "NftBonusPayed")).to.equal(undefined);
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(alice.address)) -
          before
      ).to.equal(baseNo);
      expect(await liquidity.nftBonusOf(alice.address, baseNo)).to.equal(0n);
    });

    it("harvest-all on stake pays pre-stake pending without NFT bonus across pools", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        shrimpNft,
        tokenRewardOneOverlayerReferral,
        alice,
        shrimpTokenId
      } = fixture;
      await setupSoleStakerPool(fixture, { secondPool: true });

      await time.increase(400);
      const pending0 = await liquidity.pendingReward(0, alice.address);
      const pending1 = await liquidity.pendingReward(1, alice.address);
      expect(pending0).to.be.greaterThan(0n);
      expect(pending1).to.be.greaterThan(0n);

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);

      const before = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const stakeTx = await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);
      const logs = parseLiquidityLogs(liquidity, await stakeTx.wait());
      expect(optionalEventAmount(logs, "NftBonusPayed")).to.equal(undefined);

      const harvests = logs.filter((l: any) => l.name === "Harvest");
      expect(harvests.length).to.equal(2);
      const paid0 = harvests[0].args.amount as bigint;
      const paid1 = harvests[1].args.amount as bigint;
      // Paid base is at least the pre-read pending (may include 1s block drift)
      expect(paid0).to.be.gte(pending0);
      expect(paid1).to.be.gte(pending1);
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(alice.address)) -
          before
      ).to.equal(paid0 + paid1);

      // After stake, new accrual gets NFT bonus on both pools
      await time.increase(250);
      for (const pid of [0, 1]) {
        const tx = await liquidity.connect(alice).harvest(pid);
        const hLogs = parseLiquidityLogs(liquidity, await tx.wait());
        const base = eventAmount(hLogs, "Harvest");
        expect(eventAmount(hLogs, "NftBonusPayed")).to.equal(
          mulDiv(base, 2n, 100n)
        );
      }
    });

    it("combines self-referral and NFT bonuses exactly", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        shrimpNft,
        bonusPct,
        tokenRewardOneOverlayerReferral,
        owner,
        alice,
        bob,
        shrimpTokenId,
        bonusPctTokenId
      } = fixture;
      await setupSoleStakerPool(fixture);

      await liquidity
        .connect(owner)
        .updateReferral(await tokenRewardOneOverlayerReferral.getAddress());
      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addCode("BOB", bob.address, 1); // ReferralType.Team
      await tokenRewardOneOverlayerReferral
        .connect(alice)
        .consumeReferral("BOB");

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await bonusPct
        .connect(alice)
        .approve(await liquidity.getAddress(), bonusPctTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeWhitelistedNft(await bonusPct.getAddress(), bonusPctTokenId);

      await time.increase(800);
      const aliceBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const bobBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        bob.address
      );

      const tx = await liquidity.connect(alice).harvest(0);
      const logs = parseLiquidityLogs(liquidity, await tx.wait());
      const base = eventAmount(logs, "Harvest");
      const selfBonus = eventAmount(logs, "SelfBonusPayed");
      const nftBonus = eventAmount(logs, "NftBonusPayed");
      const referrerBonus = eventAmount(logs, "BonusPayed");

      expect(selfBonus).to.equal(mulDiv(base, 25n, 1000n));
      expect(nftBonus).to.equal(
        mulDiv(base, 2n, 100n) + mulDiv(base, 3n, 100n)
      );
      expect(referrerBonus).to.equal(mulDiv(base, 5n, 100n));
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(alice.address)) -
          aliceBefore
      ).to.equal(base + selfBonus + nftBonus);
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(bob.address)) -
          bobBefore
      ).to.equal(referrerBonus);
    });

    it("sums Team self, Ref self and NFT on the same base P", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        shrimpNft,
        tokenRewardOneOverlayerReferral,
        owner,
        alice,
        bob,
        shrimpTokenId
      } = fixture;
      const [, , , , rob] = await ethers.getSigners();
      // Ref requires a fresh user (no deposit / rewards), so bind before deposit
      await setupSoleStakerPool(fixture, { skipDeposit: true });

      const ReferralTypeTeam = 1n;
      const ReferralTypeRef = 2n;

      await liquidity
        .connect(owner)
        .updateReferral(await tokenRewardOneOverlayerReferral.getAddress());
      // Team defaults: 5% referrer / 2.5% self. Ref: 10% / 5%.
      await liquidity.connect(owner).updateReferralBonus(ReferralTypeRef, 10);
      await liquidity
        .connect(owner)
        .updateSelfReferralBonus(ReferralTypeRef, 50);

      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addCode("ROB", rob.address, ReferralTypeTeam);
      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addCode("BOB", bob.address, ReferralTypeRef);
      await tokenRewardOneOverlayerReferral
        .connect(alice)
        .consumeReferral("ROB");
      await tokenRewardOneOverlayerReferral
        .connect(alice)
        .consumeReferral("BOB");

      await liquidity.connect(alice).deposit(0, ethers.parseEther("100"));

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);

      await time.increase(800);

      const aliceBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const robBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        rob.address
      );
      const bobBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        bob.address
      );

      const tx = await liquidity.connect(alice).harvest(0);
      const logs = parseLiquidityLogs(liquidity, await tx.wait());
      const base = eventAmount(logs, "Harvest");
      const selfTeam = eventAmountForType(
        logs,
        "SelfBonusPayed",
        ReferralTypeTeam
      );
      const selfRef = eventAmountForType(
        logs,
        "SelfBonusPayed",
        ReferralTypeRef
      );
      const nftBonus = eventAmount(logs, "NftBonusPayed");
      const referrerTeam = eventAmountForType(
        logs,
        "BonusPayed",
        ReferralTypeTeam
      );
      const referrerRef = eventAmountForType(
        logs,
        "BonusPayed",
        ReferralTypeRef
      );

      expect(selfTeam).to.equal(mulDiv(base, 25n, 1000n));
      expect(selfRef).to.equal(mulDiv(base, 50n, 1000n));
      expect(nftBonus).to.equal(mulDiv(base, 2n, 100n)); // shrimp 2%
      expect(referrerTeam).to.equal(mulDiv(base, 5n, 100n));
      expect(referrerRef).to.equal(mulDiv(base, 10n, 100n));

      // Alice: P + Team self + Ref self + NFT (all off the same P)
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(alice.address)) -
          aliceBefore
      ).to.equal(base + selfTeam + selfRef + nftBonus);
      expect(sumEventAmounts(logs, "SelfBonusPayed")).to.equal(
        selfTeam + selfRef
      );

      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(rob.address)) -
          robBefore
      ).to.equal(referrerTeam);
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(bob.address)) -
          bobBefore
      ).to.equal(referrerRef);
    });

    it("rejects Ref consume after deposit, allows Team after stake", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const { liquidity, tokenRewardOneOverlayerReferral, owner, alice, bob } =
        fixture;
      const [, , , , rob] = await ethers.getSigners();
      await setupSoleStakerPool(fixture);

      const ReferralTypeTeam = 1n;
      const ReferralTypeRef = 2n;

      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addCode("ROB", rob.address, ReferralTypeTeam);
      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addCode("BOB", bob.address, ReferralTypeRef);

      await expect(
        tokenRewardOneOverlayerReferral.connect(alice).consumeReferral("BOB")
      ).to.be.revertedWithCustomError(
        tokenRewardOneOverlayerReferral,
        "OverlayerReferralNotFresh"
      );

      // Team remains allowed after staking (harvests then binds)
      await expect(
        tokenRewardOneOverlayerReferral.connect(alice).consumeReferral("ROB")
      ).to.emit(tokenRewardOneOverlayerReferral, "Referral");
    });

    it("applies referral then NFT only to accrual after each bind/stake", async function () {
      // Expected timing (Ref must be bound while fresh):
      // 1) Consume Ref before deposit.
      // 2) Deposit, accrue T1, consume Team -> harvest T1 with Ref bonuses only
      //    (Team binds after harvest).
      // 3) Accrue T2, stake NFT -> harvest T2 with Team+Ref, no NFT.
      // 4) Accrue T3, harvest -> Team+Ref+NFT on the same base.
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        shrimpNft,
        tokenRewardOneOverlayerReferral,
        owner,
        alice,
        bob,
        shrimpTokenId
      } = fixture;
      const [, , , , rob] = await ethers.getSigners();
      await setupSoleStakerPool(fixture, { skipDeposit: true });

      const ReferralTypeTeam = 1n;
      const ReferralTypeRef = 2n;

      await liquidity
        .connect(owner)
        .updateReferral(await tokenRewardOneOverlayerReferral.getAddress());
      await liquidity.connect(owner).updateReferralBonus(ReferralTypeRef, 10);
      await liquidity
        .connect(owner)
        .updateSelfReferralBonus(ReferralTypeRef, 50);

      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addCode("ROB", rob.address, ReferralTypeTeam);
      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addCode("BOB", bob.address, ReferralTypeRef);

      // --- Phase 0: bind Ref while fresh, then deposit ---
      await tokenRewardOneOverlayerReferral
        .connect(alice)
        .consumeReferral("BOB");
      expect(
        await tokenRewardOneOverlayerReferral.referredFromByType(
          alice.address,
          ReferralTypeRef
        )
      ).to.equal(bob.address);

      await liquidity.connect(alice).deposit(0, ethers.parseEther("100"));

      // --- Phase 1: accrue T1, consume Team (harvests with Ref only) ---
      await time.increase(500);
      const alice0 = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const rob0 = await tokenRewardOneOverlayerReferral.balanceOf(rob.address);
      const bob0 = await tokenRewardOneOverlayerReferral.balanceOf(bob.address);

      const teamConsumeTx = await tokenRewardOneOverlayerReferral
        .connect(alice)
        .consumeReferral("ROB");
      const teamConsumeLogs = parseLiquidityLogs(
        liquidity,
        await teamConsumeTx.wait()
      );
      const phase1Base = eventAmount(teamConsumeLogs, "Harvest");
      expect(phase1Base).to.be.greaterThan(0n);
      // Ref already bound during this harvest; Team not yet
      expect(
        eventAmountForType(teamConsumeLogs, "SelfBonusPayed", ReferralTypeRef)
      ).to.equal(mulDiv(phase1Base, 50n, 1000n));
      expect(
        eventAmountForType(teamConsumeLogs, "BonusPayed", ReferralTypeRef)
      ).to.equal(mulDiv(phase1Base, 10n, 100n));
      expect(
        teamConsumeLogs.some(
          (p) =>
            (p.name === "SelfBonusPayed" || p.name === "BonusPayed") &&
            BigInt(p.args.referralType) === ReferralTypeTeam
        )
      ).to.equal(false);
      expect(optionalEventAmount(teamConsumeLogs, "NftBonusPayed")).to.equal(
        undefined
      );

      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(alice.address)) -
          alice0
      ).to.equal(phase1Base + mulDiv(phase1Base, 50n, 1000n));
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(bob.address)) - bob0
      ).to.equal(mulDiv(phase1Base, 10n, 100n));
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(rob.address)) - rob0
      ).to.equal(0n);

      // --- Phase 2: accrue T2 with both referrals, stake NFT (no NFT on harvest) ---
      await time.increase(700);
      const alice1 = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const rob1 = await tokenRewardOneOverlayerReferral.balanceOf(rob.address);
      const bob1 = await tokenRewardOneOverlayerReferral.balanceOf(bob.address);

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      const stakeTx = await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);
      const stakeLogs = parseLiquidityLogs(liquidity, await stakeTx.wait());

      const phase2Base = eventAmount(stakeLogs, "Harvest");
      const phase2SelfTeam = eventAmountForType(
        stakeLogs,
        "SelfBonusPayed",
        ReferralTypeTeam
      );
      const phase2SelfRef = eventAmountForType(
        stakeLogs,
        "SelfBonusPayed",
        ReferralTypeRef
      );
      const phase2RefTeam = eventAmountForType(
        stakeLogs,
        "BonusPayed",
        ReferralTypeTeam
      );
      const phase2RefRef = eventAmountForType(
        stakeLogs,
        "BonusPayed",
        ReferralTypeRef
      );

      expect(optionalEventAmount(stakeLogs, "NftBonusPayed")).to.equal(
        undefined
      );
      expect(phase2SelfTeam).to.equal(mulDiv(phase2Base, 25n, 1000n));
      expect(phase2SelfRef).to.equal(mulDiv(phase2Base, 50n, 1000n));
      expect(phase2RefTeam).to.equal(mulDiv(phase2Base, 5n, 100n));
      expect(phase2RefRef).to.equal(mulDiv(phase2Base, 10n, 100n));

      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(alice.address)) -
          alice1
      ).to.equal(phase2Base + phase2SelfTeam + phase2SelfRef);
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(rob.address)) - rob1
      ).to.equal(phase2RefTeam);
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(bob.address)) - bob1
      ).to.equal(phase2RefRef);

      // --- Phase 3: accrue T3 with referrals + NFT, then harvest ---
      await time.increase(900);
      const alice2 = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );
      const rob2 = await tokenRewardOneOverlayerReferral.balanceOf(rob.address);
      const bob2 = await tokenRewardOneOverlayerReferral.balanceOf(bob.address);

      const harvestTx = await liquidity.connect(alice).harvest(0);
      const harvestLogs = parseLiquidityLogs(liquidity, await harvestTx.wait());
      const phase3Base = eventAmount(harvestLogs, "Harvest");
      const phase3SelfTeam = eventAmountForType(
        harvestLogs,
        "SelfBonusPayed",
        ReferralTypeTeam
      );
      const phase3SelfRef = eventAmountForType(
        harvestLogs,
        "SelfBonusPayed",
        ReferralTypeRef
      );
      const phase3Nft = eventAmount(harvestLogs, "NftBonusPayed");
      const phase3RefTeam = eventAmountForType(
        harvestLogs,
        "BonusPayed",
        ReferralTypeTeam
      );
      const phase3RefRef = eventAmountForType(
        harvestLogs,
        "BonusPayed",
        ReferralTypeRef
      );

      expect(phase3SelfTeam).to.equal(mulDiv(phase3Base, 25n, 1000n));
      expect(phase3SelfRef).to.equal(mulDiv(phase3Base, 50n, 1000n));
      expect(phase3Nft).to.equal(mulDiv(phase3Base, 2n, 100n));
      expect(phase3RefTeam).to.equal(mulDiv(phase3Base, 5n, 100n));
      expect(phase3RefRef).to.equal(mulDiv(phase3Base, 10n, 100n));

      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(alice.address)) -
          alice2
      ).to.equal(phase3Base + phase3SelfTeam + phase3SelfRef + phase3Nft);
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(rob.address)) - rob2
      ).to.equal(phase3RefTeam);
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(bob.address)) - bob2
      ).to.equal(phase3RefRef);
    });

    it("harvestFor pays NFT bonus based on target stake, not caller", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        shrimpNft,
        stakedAsset,
        tokenRewardOneOverlayerReferral,
        owner,
        alice,
        bob,
        shrimpTokenId,
        bobShrimpTokenId
      } = fixture;

      await stakedAsset.transfer(alice.address, ethers.parseEther("100"));
      await stakedAsset.transfer(bob.address, ethers.parseEther("100"));
      await stakedAsset
        .connect(alice)
        .approve(await liquidity.getAddress(), ethers.parseEther("100"));
      await stakedAsset
        .connect(bob)
        .approve(await liquidity.getAddress(), ethers.parseEther("100"));

      await liquidity.setReward(
        await tokenRewardOneOverlayerReferral.getAddress(),
        REWARD_PER_SECOND
      );
      await tokenRewardOneOverlayerReferral
        .connect(owner)
        .addPointsTracker(await liquidity.getAddress());
      await liquidity.add(
        await stakedAsset.getAddress(),
        await tokenRewardOneOverlayerReferral.getAddress(),
        1,
        0,
        false,
        true
      );

      await liquidity.connect(alice).deposit(0, ethers.parseEther("50"));
      await liquidity.connect(bob).deposit(0, ethers.parseEther("50"));

      // Only bob stakes an Origin NFT
      await shrimpNft
        .connect(bob)
        .approve(await liquidity.getAddress(), bobShrimpTokenId);
      await liquidity
        .connect(bob)
        .stakeOriginNft(await shrimpNft.getAddress(), bobShrimpTokenId);

      await time.increase(600);

      const bobBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        bob.address
      );
      const aliceBefore = await tokenRewardOneOverlayerReferral.balanceOf(
        alice.address
      );

      // Alice calls harvestFor(bob)
      const tx = await liquidity.connect(alice).harvestFor(0, bob.address);
      const logs = parseLiquidityLogs(liquidity, await tx.wait());
      const base = eventAmount(logs, "Harvest");
      const nftBonus = eventAmount(logs, "NftBonusPayed");
      expect(nftBonus).to.equal(mulDiv(base, 2n, 100n));
      expect(
        (await tokenRewardOneOverlayerReferral.balanceOf(bob.address)) -
          bobBefore
      ).to.equal(base + nftBonus);
      // Caller alice should not receive bob's rewards
      expect(
        await tokenRewardOneOverlayerReferral.balanceOf(alice.address)
      ).to.equal(aliceBefore);

      // Alice herself has no NFT — her harvest has no NFT bonus
      const aliceTx = await liquidity.connect(alice).harvest(0);
      const aliceLogs = parseLiquidityLogs(liquidity, await aliceTx.wait());
      expect(optionalEventAmount(aliceLogs, "NftBonusPayed")).to.equal(
        undefined
      );
      // silence unused
      void shrimpTokenId;
    });

    it("switching Origin tier changes bonus only on new accrual", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        shrimpNft,
        whaleNft,
        alice,
        shrimpTokenId,
        whaleTokenId
      } = fixture;
      await setupSoleStakerPool(fixture);

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);

      await time.increase(200);
      const shrimpHarvest = await liquidity.connect(alice).harvest(0);
      const shrimpLogs = parseLiquidityLogs(
        liquidity,
        await shrimpHarvest.wait()
      );
      const shrimpBase = eventAmount(shrimpLogs, "Harvest");
      expect(eventAmount(shrimpLogs, "NftBonusPayed")).to.equal(
        mulDiv(shrimpBase, 2n, 100n)
      );

      await time.increase(100);
      await liquidity.connect(alice).unstakeOriginNft();

      await whaleNft
        .connect(alice)
        .approve(await liquidity.getAddress(), whaleTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await whaleNft.getAddress(), whaleTokenId);

      await time.increase(200);
      const whaleHarvest = await liquidity.connect(alice).harvest(0);
      const whaleLogs = parseLiquidityLogs(
        liquidity,
        await whaleHarvest.wait()
      );
      const whaleBase = eventAmount(whaleLogs, "Harvest");
      expect(eventAmount(whaleLogs, "NftBonusPayed")).to.equal(
        mulDiv(whaleBase, 11n, 100n)
      );
    });

    it("sole staker accrual matches rewardPerSecond * elapsed within harvest window", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const { liquidity, shrimpNft, alice, shrimpTokenId } = fixture;
      await setupSoleStakerPool(fixture);

      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);

      // Align to a clean timestamp, then advance a known duration
      const t0 = BigInt(await time.latest());
      await time.increaseTo(t0 + 1n);
      const start = BigInt(await time.latest());
      await time.increaseTo(start + 1_000n);

      const tx = await liquidity.connect(alice).harvest(0);
      const receipt = await tx.wait();
      const end = BigInt(await time.latest());
      const logs = parseLiquidityLogs(liquidity, receipt);
      const base = eventAmount(logs, "Harvest");
      const elapsed = end - start;
      // Sole staker, alloc=1/1 => rewards ~= rewardPerSecond * elapsed
      // Allow ±1 second of pool-update skew from the stake/deposit lastRewardTime vs start
      expect(base).to.be.gte(REWARD_PER_SECOND * (elapsed - 2n));
      expect(base).to.be.lte(REWARD_PER_SECOND * (elapsed + 2n));
      expect(eventAmount(logs, "NftBonusPayed")).to.equal(
        mulDiv(base, 2n, 100n)
      );
    });

    it("adds 2.5% OG holder boost on top of Origin bonus when Origin is staked", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const { liquidity, shrimpNft, ogNft, alice, shrimpTokenId } = fixture;
      await setupSoleStakerPool(fixture);

      await ogNft.connect(alice).mint(alice.address);
      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);

      await time.increase(500);
      const tx = await liquidity.connect(alice).harvest(0);
      const logs = parseLiquidityLogs(liquidity, await tx.wait());
      const base = eventAmount(logs, "Harvest");
      const nftBonus = eventAmount(logs, "NftBonusPayed");
      // shrimp 2% + OG 2.5%
      expect(nftBonus).to.equal(
        mulDiv(base, 2n, 100n) + mulDiv(base, 25n, 1000n)
      );
      expect(await liquidity.nftBonusOf(alice.address, base)).to.equal(
        nftBonus
      );
      expect(
        await liquidity.pendingRewardWithNftBonus(0, alice.address)
      ).to.equal(0n); // just harvested
    });

    it("does not apply OG boost without an Origin stake", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const { liquidity, ogNft, alice } = fixture;
      await setupSoleStakerPool(fixture);

      await ogNft.connect(alice).mint(alice.address);

      await time.increase(400);
      const tx = await liquidity.connect(alice).harvest(0);
      const logs = parseLiquidityLogs(liquidity, await tx.wait());
      const base = eventAmount(logs, "Harvest");
      expect(optionalEventAmount(logs, "NftBonusPayed")).to.equal(undefined);
      expect(await liquidity.nftBonusOf(alice.address, base)).to.equal(0n);
    });

    it("stacks OG boost with whitelist bonuses on Origin stake", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const {
        liquidity,
        shrimpNft,
        bonusPct,
        ogNft,
        alice,
        shrimpTokenId,
        bonusPctTokenId
      } = fixture;
      await setupSoleStakerPool(fixture);

      await ogNft.connect(alice).mint(alice.address);
      await shrimpNft
        .connect(alice)
        .approve(await liquidity.getAddress(), shrimpTokenId);
      await bonusPct
        .connect(alice)
        .approve(await liquidity.getAddress(), bonusPctTokenId);
      await liquidity
        .connect(alice)
        .stakeOriginNft(await shrimpNft.getAddress(), shrimpTokenId);
      await liquidity
        .connect(alice)
        .stakeWhitelistedNft(await bonusPct.getAddress(), bonusPctTokenId);

      await time.increase(600);
      const tx = await liquidity.connect(alice).harvest(0);
      const logs = parseLiquidityLogs(liquidity, await tx.wait());
      const base = eventAmount(logs, "Harvest");
      const nftBonus = eventAmount(logs, "NftBonusPayed");
      // shrimp 2% + OG 2.5% + whitelist 3%
      expect(nftBonus).to.equal(
        mulDiv(base, 2n, 100n) +
          mulDiv(base, 25n, 1000n) +
          mulDiv(base, 3n, 100n)
      );
    });

    it("allows owner to set and clear the OG NFT address", async function () {
      const fixture = await loadFixture(deployAccountingFixture);
      const { liquidity, owner, notOwner, ogNft } = fixture;
      const BonusNFT = await ethers.getContractFactory("BonusNFTMock");
      const otherOg = await BonusNFT.deploy("OG2", "OG2", 0, 100);

      await expect(
        liquidity.connect(notOwner).setOgNft(await otherOg.getAddress())
      ).to.be.eventually.rejected;

      await expect(
        liquidity.connect(owner).setOgNft(await otherOg.getAddress())
      )
        .to.emit(liquidity, "OgNftUpdated")
        .withArgs(await otherOg.getAddress());
      expect(await liquidity.ogNft()).to.equal(await otherOg.getAddress());

      await liquidity.connect(owner).setOgNft(ethers.ZeroAddress);
      expect(await liquidity.ogNft()).to.equal(ethers.ZeroAddress);

      // Clearing OG address disables boost even if alice still holds old OG
      void ogNft;
    });
  });
});
