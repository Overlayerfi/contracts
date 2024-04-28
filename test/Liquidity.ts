import {
  time,
  loadFixture,
  mineUpTo
} from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect, assert } from "chai";

describe("Liquidity", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    const latestBlock: number = await time.latestBlock();
    // Contracts are deployed using the first signer/account by default
    const [owner, notOwner, alice, bob] = await ethers.getSigners();

    const Liquidity = await ethers.getContractFactory("Liquidity");
    const liquidity = await Liquidity.deploy(owner.getAddress(), latestBlock);

    const StakedAsset = await ethers.getContractFactory("TokenLP_A_B");
    const stakedAsset = await StakedAsset.deploy(
      ethers.parseEther("1000"),
      "LPABONE",
      "LPABONE"
    );
    await stakedAsset.setMinter(liquidity.getAddress());

    const TokenRewardOne = await ethers.getContractFactory(
      "LiquidityAirdropReward"
    );
    const tokenRewardOne = await TokenRewardOne.deploy(owner.address);
    await tokenRewardOne.setMinter(liquidity.getAddress());
    // not using LiquidityAirdropReward as in some tests we need to transfer it
    const TokenRewardTwo = await ethers.getContractFactory("TokenLP_A_B");
    const tokenRewardTwo = await TokenRewardTwo.deploy(
      ethers.parseEther("1000"),
      "LPABTWO",
      "LPABTWO"
    );
    await tokenRewardTwo.setMinter(liquidity.getAddress());

    return {
      liquidity,
      stakedAsset,
      tokenRewardOne,
      tokenRewardTwo,
      latestBlock,
      owner,
      notOwner,
      alice,
      bob
    };
  }

  describe("Deployment", function () {
    it("Should set the right dev address", async function () {
      const { liquidity, owner } = await loadFixture(deployFixture);
      expect(await liquidity.owner()).to.equal(await owner.getAddress());
    });

    it("Should set the right start block", async function () {
      const { liquidity, latestBlock } = await loadFixture(deployFixture);
      expect(await liquidity.startBlock()).to.equal(latestBlock);
    });
  });

  describe("ModifyParam", function () {
    it("Should update multiplier", async function () {
      const { liquidity } = await loadFixture(deployFixture);
      await liquidity.updateMultiplier(2);
      expect(await liquidity.bonusMultiplier()).to.equal(2);
    });

    it("Should revert update multiplier if not owner", async function () {
      const { liquidity, notOwner } = await loadFixture(deployFixture);
      await expect(liquidity.connect(notOwner).updateMultiplier(2)).to.be
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
      const { liquidity, stakedAsset, tokenRewardOne } = await loadFixture(
        deployFixture
      );
      await liquidity.setReward(tokenRewardOne.getAddress(), 1);
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOne.getAddress(),
        1,
        true
      );
      expect(await liquidity.poolLength()).to.equal(1);
      await liquidity.setReward(stakedAsset.getAddress(), 1);
      await liquidity.add(
        tokenRewardOne.getAddress(),
        stakedAsset.getAddress(),
        1,
        true
      );
      expect(await liquidity.poolLength()).to.equal(2);
    });

    it("Should return correct allocation points for different pools", async function () {
      const { liquidity, stakedAsset, tokenRewardOne, tokenRewardTwo } =
        await loadFixture(deployFixture);
      await liquidity.setReward(tokenRewardOne.getAddress(), 1);
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOne.getAddress(),
        1,
        true
      );
      expect(await liquidity.poolLength()).to.equal(1);
      await liquidity.setReward(stakedAsset.getAddress(), 1);
      await liquidity.add(
        tokenRewardOne.getAddress(),
        stakedAsset.getAddress(),
        10,
        true
      );
      expect(await liquidity.poolLength()).to.equal(2);
      await liquidity.add(
        tokenRewardTwo.getAddress(),
        stakedAsset.getAddress(),
        100,
        true
      );
      expect(await liquidity.poolLength()).to.equal(3);
      expect(
        await liquidity.totalAllocPointsPerReward(tokenRewardOne.getAddress())
      ).to.be.equal(1);
      expect(
        await liquidity.totalAllocPointsPerReward(stakedAsset.getAddress())
      ).to.be.equal(110);
    });

    it("Should not add a new pool if not owner", async function () {
      const { liquidity, stakedAsset, tokenRewardOne, notOwner } =
        await loadFixture(deployFixture);
      await liquidity.setReward(tokenRewardOne.getAddress(), 1);
      await expect(
        liquidity
          .connect(notOwner)
          .add(stakedAsset.getAddress(), tokenRewardOne.getAddress(), 1, false)
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
        await liquidity.rewardsPerBlock(stakedAsset.getAddress())
      ).to.be.equal(1);
      await liquidity.setReward(stakedAsset.getAddress(), 10);
      expect(
        await liquidity.rewardsPerBlock(stakedAsset.getAddress())
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
      const { liquidity, stakedAsset, tokenRewardOne } = await loadFixture(
        deployFixture
      );
      await liquidity.setReward(stakedAsset.getAddress(), 1);
      await liquidity.add(
        tokenRewardOne.getAddress(),
        stakedAsset.getAddress(),
        1,
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
      const { liquidity, stakedAsset, tokenRewardOne, notOwner } =
        await loadFixture(deployFixture);
      await liquidity.setReward(stakedAsset.getAddress(), 1);
      await liquidity.add(
        tokenRewardOne.getAddress(),
        stakedAsset.getAddress(),
        1,
        true
      );
      await expect(liquidity.connect(notOwner).setPoolAllocPoints(0, 10, true))
        .to.be.eventually.rejected;
    });
  });

  describe("CoreFunctionality", function () {
    it("Deposit", async function () {
      const { liquidity, stakedAsset, tokenRewardOne, alice, bob } =
        await loadFixture(deployFixture);

      const latestBlock: number = await time.latestBlock();
      await mineUpTo(latestBlock + 1);

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

      await liquidity.setReward(tokenRewardOne.getAddress(), 1);
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOne.getAddress(),
        1,
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

    it("Should return right pending reward with block advance", async function () {
      // block number starts from zero
      const { liquidity, stakedAsset, tokenRewardOne, alice, bob } =
        await loadFixture(deployFixture);
      const users: Array<any> = [alice, bob];
      const PARTICIPATION: string = "10";
      const TOTAL_PARTICIPATION: string = (
        users.length * +PARTICIPATION
      ).toString();
      const REWARD_PER_BLOCK: string = "1";

      const latestBlock: number = await time.latestBlock();
      await mineUpTo(latestBlock + 1);
      await liquidity.setReward(
        tokenRewardOne.getAddress(),
        ethers.parseEther(REWARD_PER_BLOCK)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOne.getAddress(),
        1,
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
      const afterAliceDeposit: number = await time.latestBlock();

      await expect(
        await liquidity
          .connect(bob)
          .deposit(0, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterBobDeposit: number = await time.latestBlock();

      expect(await stakedAsset.balanceOf(alice.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await stakedAsset.balanceOf(bob.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await liquidity.getTotalStakedInPool(0)).to.equal(
        ethers.parseEther("20")
      );

      const BLOCKS_TO_MINE: number = 100;
      await mineUpTo(afterBobDeposit + BLOCKS_TO_MINE);
      // two users, there is alice and bob supply
      let commonRewardBlocks: number = BLOCKS_TO_MINE;
      // one users, there is only alice supply for these blocks
      const onlyAliceRewardBlock: number = afterBobDeposit - afterAliceDeposit;
      const twoUserTotalSupply: number = +TOTAL_PARTICIPATION;
      const oneUserTotalSupply: number = +PARTICIPATION;

      expect(await liquidity.pendingReward(0, alice.getAddress())).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
              commonRewardBlocks *
              +REWARD_PER_BLOCK +
            (+PARTICIPATION * onlyAliceRewardBlock * +REWARD_PER_BLOCK) /
              oneUserTotalSupply
          ).toString()
        )
      );
      expect(await liquidity.pendingReward(0, bob.getAddress())).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
            commonRewardBlocks *
            +REWARD_PER_BLOCK
          ).toString()
        )
      );

      await mineUpTo(afterBobDeposit + BLOCKS_TO_MINE * 2);
      commonRewardBlocks = BLOCKS_TO_MINE * 2;
      expect(await liquidity.pendingReward(0, alice.getAddress())).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
              commonRewardBlocks *
              +REWARD_PER_BLOCK +
            (+PARTICIPATION * onlyAliceRewardBlock * +REWARD_PER_BLOCK) /
              oneUserTotalSupply
          ).toString()
        )
      );
      expect(await liquidity.pendingReward(0, bob.getAddress())).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
            commonRewardBlocks *
            +REWARD_PER_BLOCK
          ).toString()
        )
      );
    });

    it("Should have proportioned reward with same reward blocks and deposit with different weights", async function () {
      // block number starts from zero
      const {
        liquidity,
        stakedAsset,
        tokenRewardOne,
        tokenRewardTwo,
        alice,
        bob
      } = await loadFixture(deployFixture);
      const PARTICIPATION: string = "10";
      const REWARD_PER_BLOCK: string = "1";

      const latestBlock: number = await time.latestBlock();
      await mineUpTo(latestBlock + 1);
      await liquidity.setReward(
        tokenRewardOne.getAddress(),
        ethers.parseEther(REWARD_PER_BLOCK)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOne.getAddress(),
        1000,
        true
      );
      await liquidity.add(
        tokenRewardTwo.getAddress(),
        tokenRewardOne.getAddress(),
        2000,
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
      const afterAliceDeposit: number = await time.latestBlock();

      expect(await tokenRewardTwo.balanceOf(bob.getAddress())).to.be.equal(
        ethers.parseEther(PARTICIPATION)
      );
      await expect(
        await liquidity
          .connect(bob)
          .deposit(1, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterBobDeposit: number = await time.latestBlock();

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

      const BLOCKS_TO_MINE: number = 100;
      await mineUpTo(afterBobDeposit + BLOCKS_TO_MINE);
      // two users, there is alice and bob supply
      let commonRewardBlocks: number = BLOCKS_TO_MINE;
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
              +REWARD_PER_BLOCK *
              (1 / 3)) /
              +oneUserTotalSupply +
            (+PARTICIPATION *
              onlyAliceRewardBlock *
              +REWARD_PER_BLOCK *
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
              +REWARD_PER_BLOCK *
              (2 / 3)) /
            +oneUserTotalSupply
          ).toFixed(1)
        )
      );
    });

    it("Should have same reward with same reward blocks and deposit", async function () {
      // block number starts from zero
      const { liquidity, stakedAsset, tokenRewardOne, alice, bob } =
        await loadFixture(deployFixture);
      const users: Array<any> = [alice, bob];
      const PARTICIPATION: string = "10";
      const TOTAL_PARTICIPATION: string = (
        users.length * +PARTICIPATION
      ).toString();
      const REWARD_PER_BLOCK: string = "1";

      const latestBlock: number = await time.latestBlock();
      await mineUpTo(latestBlock + 1);
      await liquidity.setReward(
        tokenRewardOne.getAddress(),
        ethers.parseEther(REWARD_PER_BLOCK)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOne.getAddress(),
        1,
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
      const afterAliceDeposit: number = await time.latestBlock();

      await expect(
        await liquidity
          .connect(bob)
          .deposit(0, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterBobDeposit: number = await time.latestBlock();

      expect(await stakedAsset.balanceOf(alice.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await stakedAsset.balanceOf(bob.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await liquidity.getTotalStakedInPool(0)).to.equal(
        ethers.parseEther("20")
      );

      const BLOCKS_TO_MINE: number = 100;
      await mineUpTo(afterBobDeposit + BLOCKS_TO_MINE);
      // two users, there is alice and bob supply
      let commonRewardBlocks: number = BLOCKS_TO_MINE;
      // one users, there is only alice supply for these blocks
      const onlyAliceRewardBlock: number = afterBobDeposit - afterAliceDeposit;
      const twoUserTotalSupply: number = +TOTAL_PARTICIPATION;
      const oneUserTotalSupply: number = +PARTICIPATION;

      expect(await liquidity.pendingReward(0, alice.getAddress())).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
              commonRewardBlocks *
              +REWARD_PER_BLOCK +
            (+PARTICIPATION * onlyAliceRewardBlock * +REWARD_PER_BLOCK) /
              oneUserTotalSupply
          ).toString()
        )
      );
      expect(await liquidity.pendingReward(0, bob.getAddress())).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
            commonRewardBlocks *
            +REWARD_PER_BLOCK
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
      const aliceReward = await tokenRewardOne.balanceOf(alice.getAddress());
      const bobReward = await tokenRewardOne.balanceOf(bob.getAddress());
      assert.isTrue(
        ethers.formatEther(aliceReward) === ethers.formatEther(bobReward)
      );
    });

    it("Should have double reward with same blocks and double deposit deposit", async function () {
      // block number starts from zero
      const { liquidity, stakedAsset, tokenRewardOne, alice, bob } =
        await loadFixture(deployFixture);
      const PARTICIPATION: string = "10";
      const HALF_PARTICIPATION: string = "5";
      const TOTAL_PARTICIPATION: string = "15";
      const REWARD_PER_BLOCK: string = "1";

      const latestBlock: number = await time.latestBlock();
      await mineUpTo(latestBlock + 1);
      await liquidity.setReward(
        tokenRewardOne.getAddress(),
        ethers.parseEther(REWARD_PER_BLOCK)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOne.getAddress(),
        1,
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
      const afterAliceDeposit: number = await time.latestBlock();

      await expect(
        await liquidity
          .connect(bob)
          .deposit(0, ethers.parseEther(HALF_PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterBobDeposit: number = await time.latestBlock();

      expect(await stakedAsset.balanceOf(alice.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await stakedAsset.balanceOf(bob.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await liquidity.getTotalStakedInPool(0)).to.equal(
        ethers.parseEther("15")
      );

      const BLOCKS_TO_MINE: number = 100;
      await mineUpTo(afterBobDeposit + BLOCKS_TO_MINE);
      // two users, there is alice and bob supply
      let commonRewardBlocks: number = BLOCKS_TO_MINE;
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
            +REWARD_PER_BLOCK +
          (+PARTICIPATION * onlyAliceRewardBlock * +REWARD_PER_BLOCK) /
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
          +REWARD_PER_BLOCK
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
      const aliceReward = await tokenRewardOne.balanceOf(alice.getAddress());
      const bobReward = await tokenRewardOne.balanceOf(bob.getAddress());
      assert.isTrue(
        +(+ethers.formatEther(aliceReward)).toFixed(1) === expectedAliceReward
      );
      assert.isTrue(
        +(+ethers.formatEther(bobReward)).toFixed(1) * 2 === expectedBobReward
      );
    });

    it("Should harvest correct amount", async function () {
      // block number starts from zero
      const { liquidity, stakedAsset, tokenRewardOne, alice, bob } =
        await loadFixture(deployFixture);
      const users: Array<any> = [alice, bob];
      const PARTICIPATION: string = "10";
      const TOTAL_PARTICIPATION: string = (
        users.length * +PARTICIPATION
      ).toString();
      const REWARD_PER_BLOCK: string = "1";

      const latestBlock: number = await time.latestBlock();
      await mineUpTo(latestBlock + 1);
      await liquidity.setReward(
        tokenRewardOne.getAddress(),
        ethers.parseEther(REWARD_PER_BLOCK)
      );
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOne.getAddress(),
        1,
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
      const afterAliceDeposit: number = await time.latestBlock();

      await expect(
        await liquidity
          .connect(bob)
          .deposit(0, ethers.parseEther(PARTICIPATION))
      ).to.emit(liquidity, "Deposit");
      const afterBobDeposit: number = await time.latestBlock();

      expect(await stakedAsset.balanceOf(alice.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await stakedAsset.balanceOf(bob.getAddress())).to.equal(
        ethers.parseEther("0")
      );
      expect(await liquidity.getTotalStakedInPool(0)).to.equal(
        ethers.parseEther("20")
      );

      const BLOCKS_TO_MINE: number = 100;
      await mineUpTo(afterBobDeposit + BLOCKS_TO_MINE);
      // two users, there is alice and bob supply
      let commonRewardBlocks: number = BLOCKS_TO_MINE;
      // one users, there is only alice supply for these blocks
      const onlyAliceRewardBlock: number = afterBobDeposit - afterAliceDeposit;
      const twoUserTotalSupply: number = +TOTAL_PARTICIPATION;
      const oneUserTotalSupply: number = +PARTICIPATION;

      const beforeAliceHarvestBlock: number = await time.latestBlock();
      expect(await liquidity.connect(alice).harvest(0)).to.emit(
        liquidity,
        "Harvest"
      );
      const afterAliceHarverstBlock: number = await time.latestBlock();
      expect(await liquidity.connect(bob).harvest(0)).to.emit(
        liquidity,
        "Harvest"
      );
      const afterBobHarverstBlock: number = await time.latestBlock();
      const aliceHarverstBlocksToAdd: number =
        afterAliceHarverstBlock - beforeAliceHarvestBlock;
      const bobHarvestBlocksToAdd: number =
        afterBobHarverstBlock - beforeAliceHarvestBlock;

      expect(await tokenRewardOne.balanceOf(alice.getAddress())).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
              (commonRewardBlocks + aliceHarverstBlocksToAdd) *
              +REWARD_PER_BLOCK +
            (+PARTICIPATION * onlyAliceRewardBlock * +REWARD_PER_BLOCK) /
              oneUserTotalSupply
          ).toString()
        )
      );
      expect(await tokenRewardOne.balanceOf(bob.getAddress())).to.equal(
        ethers.parseEther(
          (
            (+PARTICIPATION / twoUserTotalSupply) *
            (commonRewardBlocks + bobHarvestBlocksToAdd) *
            +REWARD_PER_BLOCK
          ).toString()
        )
      );

      //check that new pending reward discount already harvested amount
      await mineUpTo((await time.latestBlock()) + 100);
      const alreadyHarvestedAmount: number = +ethers.formatEther(
        await tokenRewardOne.balanceOf(alice.getAddress())
      );
      const elapsedBlockFromLastUpdate: number =
        (await time.latestBlock()) - afterBobDeposit;
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
      const { liquidity, stakedAsset, tokenRewardOne, alice, bob } =
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

      await liquidity.setReward(tokenRewardOne.getAddress(), 1);
      await liquidity.add(
        stakedAsset.getAddress(),
        tokenRewardOne.getAddress(),
        1,
        true
      );

      const latestBlock: number = await time.latestBlock();
      await mineUpTo(latestBlock + 1);
      await expect(await liquidity.connect(alice).deposit(0, 5)).to.emit(
        liquidity,
        "Deposit"
      );
      await expect(await liquidity.connect(bob).deposit(0, 5)).to.emit(
        liquidity,
        "Deposit"
      );
      await mineUpTo(latestBlock + 11);

      await expect(await liquidity.connect(alice).deposit(0, 0)).to.emit(
        liquidity,
        "Deposit"
      );
      await expect(await liquidity.connect(bob).deposit(0, 0)).to.emit(
        liquidity,
        "Deposit"
      );
      let aliceReward = await tokenRewardOne.balanceOf(alice.getAddress());
      let bobReward = await tokenRewardOne.balanceOf(bob.getAddress());
      assert.isTrue(aliceReward.toString() == "5");
      assert.isTrue(bobReward.toString() == "5");

      await mineUpTo(latestBlock + 40);
      await expect(liquidity.connect(alice).withdraw(0, 10)).to.be.eventually
        .rejected;
      await expect(liquidity.connect(bob).withdraw(0, 10)).to.be.eventually
        .rejected;
    });
  });
});
