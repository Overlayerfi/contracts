import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("rOVA", function () {
  async function deployFixture() {
    const [admin, whitelisted, nonWhitelisted, another] =
      await ethers.getSigners();

    // Deploy the rOVA with admin as the owner
    const Rewards = await ethers.getContractFactory("rOVA");
    const rewards = await Rewards.deploy(admin.address);
    await rewards.waitForDeployment();

    return { rewards, admin, whitelisted, nonWhitelisted, another };
  }

  describe("Deployment", function () {
    it("Should set the owner correctly", async function () {
      const { rewards, admin } = await loadFixture(deployFixture);
      expect(await rewards.owner()).to.equal(admin.address);
    });

    it("Should have token name and symbol as rOVA", async function () {
      const { rewards } = await loadFixture(deployFixture);
      expect(await rewards.name()).to.equal("rOVA");
      expect(await rewards.symbol()).to.equal("rOVA");
    });
  });

  describe("Whitelist management", function () {
    it("Should add an address for USDT reward", async function () {
      const { rewards, whitelisted, another } = await loadFixture(
        deployFixture
      );
      // For USDT reward, the Reward enum value is 0 and amount is 50 USDT (with 6 decimals)
      const amount = 50_000_000; // 50 USDT (50 * 10^6)
      await expect(
        rewards.batchAdd(
          [whitelisted.address, another.address],
          [amount, amount],
          0
        )
      )
        .to.emit(rewards, "RewardWhitelisted")
        .withArgs(whitelisted.address, 0, amount);
      expect(await rewards.allowedUsdt(whitelisted.address)).to.equal(amount);
    });

    it("Should add an address for rOVA reward", async function () {
      const { rewards, whitelisted } = await loadFixture(deployFixture);
      // For rOVA reward, the Reward enum value is 1 and amount is 50 rOVA (with 18 decimals)
      const amount = ethers.parseEther("50");
      await expect(rewards.add(whitelisted.address, 1, amount))
        .to.emit(rewards, "RewardWhitelisted")
        .withArgs(whitelisted.address, 1, amount);
      expect(await rewards.allowedROva(whitelisted.address)).to.equal(amount);
    });

    it("Should remove an address from USDT reward whitelist", async function () {
      const { rewards, whitelisted } = await loadFixture(deployFixture);
      const amount = 50_000_000;
      await rewards.add(whitelisted.address, 0, amount);
      await expect(rewards.remove(whitelisted.address, 0))
        .to.emit(rewards, "RewardRemoved")
        .withArgs(whitelisted.address, 0);
      expect(await rewards.allowedUsdt(whitelisted.address)).to.equal(0);
    });

    it("Should remove an address from rOVA reward whitelist", async function () {
      const { rewards, whitelisted } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("50");
      await rewards.add(whitelisted.address, 1, amount);
      await expect(rewards.remove(whitelisted.address, 1))
        .to.emit(rewards, "RewardRemoved")
        .withArgs(whitelisted.address, 1);
      expect(await rewards.allowedROva(whitelisted.address)).to.equal(0);
    });

    it("Should batch add addresses for USDT reward", async function () {
      const { rewards, whitelisted, another } = await loadFixture(
        deployFixture
      );
      const accounts = [whitelisted.address, another.address];
      const amounts = [50_000_000, 50_000_000];
      await expect(rewards.batchAdd(accounts, amounts, 0))
        .to.emit(rewards, "RewardWhitelisted")
        .withArgs(whitelisted.address, 0, 50_000_000)
        .and.to.emit(rewards, "RewardWhitelisted")
        .withArgs(another.address, 0, 50_000_000);
      expect(await rewards.allowedUsdt(whitelisted.address)).to.equal(
        50_000_000
      );
      expect(await rewards.allowedUsdt(another.address)).to.equal(50_000_000);
    });

    it("Should batch remove addresses for rOVA reward", async function () {
      const { rewards, whitelisted, another } = await loadFixture(
        deployFixture
      );
      const amount = ethers.parseEther("50");
      await rewards.batchAdd(
        [whitelisted.address, another.address],
        [amount, amount],
        1
      );
      await expect(
        rewards.batchRemove([whitelisted.address, another.address], 1)
      )
        .to.emit(rewards, "RewardRemoved")
        .withArgs(whitelisted.address, 1)
        .and.to.emit(rewards, "RewardRemoved")
        .withArgs(another.address, 1);
      expect(await rewards.allowedROva(whitelisted.address)).to.equal(0);
      expect(await rewards.allowedROva(another.address)).to.equal(0);
    });
  });

  describe("Reward Collection", function () {
    it("Should revert collect if no reward is assigned", async function () {
      const { rewards, nonWhitelisted } = await loadFixture(deployFixture);
      await expect(
        rewards.connect(nonWhitelisted).collect()
      ).to.be.revertedWithCustomError(rewards, "NothingToCollect");
    });

    it("Should collect rOVA reward and mint tokens", async function () {
      const { rewards, whitelisted } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("50");
      await rewards.add(whitelisted.address, 1, amount);
      // Before collection, the rOVA balance should be 0.
      expect(await rewards.balanceOf(whitelisted.address)).to.equal(0);
      await expect(rewards.connect(whitelisted).collect())
        .to.emit(rewards, "RewardCollected")
        .withArgs(whitelisted.address, 1, amount);
      expect(await rewards.balanceOf(whitelisted.address)).to.equal(amount);
      // After collection, the allowed rOVA amount should be reset to 0.
      expect(await rewards.allowedROva(whitelisted.address)).to.equal(0);
    });
  });

  describe("Recover function", function () {
    it("Should allow the owner to recover ERC20 tokens", async function () {
      const { rewards, admin } = await loadFixture(deployFixture);
      // Deploy a mock ERC20 token to simulate an accidental token transfer.
      const MintableERC20 = await ethers.getContractFactory("MintableERC20");
      const token = await MintableERC20.deploy("1000000", "MockToken", "MCK");
      await token.waitForDeployment();

      // Transfer some tokens to the rewards contract.
      await token.transfer(
        await rewards.getAddress(),
        ethers.parseUnits("1000", 18)
      );
      expect(await token.balanceOf(await rewards.getAddress())).to.equal(
        ethers.parseUnits("1000", 18)
      );

      // Recover the tokens back to the admin.
      await rewards.recover(await token.getAddress());
      expect(await token.balanceOf(admin.address)).to.be.gt(0);
    });
  });
});
