import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("rOVA V2 Token", function () {
  async function deployFixture() {
    const [admin, whitelisted, nonWhitelisted, another] =
      await ethers.getSigners();

    // Deploy the rOVAV2 with admin as the owner
    const Rewards = await ethers.getContractFactory("rOVAV2");
    const rewards = await Rewards.deploy(admin.address, {
      gasLimit: 10000000,
      maxFeePerGas: 50 * 10 ** 9
    });
    await rewards.waitForDeployment();

    return { rewards, admin, whitelisted, nonWhitelisted, another };
  }

  describe("Deployment", function () {
    it("Should set the owner correctly", async function () {
      const { rewards, admin } = await loadFixture(deployFixture);
      expect(await rewards.owner()).to.equal(admin.address);
    });

    it("Should have token name and symbol as rOVAV2", async function () {
      const { rewards } = await loadFixture(deployFixture);
      expect(await rewards.name()).to.equal("rOVAV2");
      expect(await rewards.symbol()).to.equal("rOVAV2");
    });
  });

  describe("Whitelist management", function () {
    it("Should add an address for rOVAV2 reward", async function () {
      const { rewards, whitelisted } = await loadFixture(deployFixture);
      // For rOVAV2 reward, the Reward enum value is 1 and amount is 50 rOVAV2 (with 18 decimals)
      const amount = ethers.parseEther("50");
      await expect(rewards.add(whitelisted.address, amount))
        .to.emit(rewards, "RewardWhitelisted")
        .withArgs(whitelisted.address, amount);
      expect(await rewards.allowedROva(whitelisted.address)).to.equal(amount);
    });

    it("Should remove an address from rOVAV2 reward whitelist", async function () {
      const { rewards, whitelisted } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("50");
      await rewards.add(whitelisted.address, amount);
      await expect(rewards.remove(whitelisted.address))
        .to.emit(rewards, "RewardRemoved")
        .withArgs(whitelisted.address);
      expect(await rewards.allowedROva(whitelisted.address)).to.equal(0);
    });

    it("Should batch remove addresses for rOVAV2 reward", async function () {
      const { rewards, whitelisted, another } = await loadFixture(
        deployFixture
      );
      const amount = ethers.parseEther("50");
      await rewards.batchAdd(
        [whitelisted.address, another.address],
        [amount, amount]
      );
      await expect(rewards.batchRemove([whitelisted.address, another.address]))
        .to.emit(rewards, "RewardRemoved")
        .withArgs(whitelisted.address)
        .and.to.emit(rewards, "RewardRemoved")
        .withArgs(another.address);
      expect(await rewards.allowedROva(whitelisted.address)).to.equal(0);
      expect(await rewards.allowedROva(another.address)).to.equal(0);
    });
  });

  describe("Transfer", function () {
    it("Should not transfer", async function () {
      const { rewards, whitelisted, admin } = await loadFixture(deployFixture);
      await rewards.setCollection();
      const amount = ethers.parseEther("50");
      await rewards.add(whitelisted.address, amount);
      // Before collection, the rOVAV2 balance should be 0.
      expect(await rewards.balanceOf(whitelisted.address)).to.equal(0);
      await expect(rewards.connect(whitelisted).collect())
        .to.emit(rewards, "RewardCollected")
        .withArgs(whitelisted.address, amount);
      expect(await rewards.balanceOf(whitelisted.address)).to.equal(amount);
      // After collection, the allowed rOVAV2 amount should be reset to 0.
      expect(await rewards.allowedROva(whitelisted.address)).to.equal(0);

      await expect(
        rewards.connect(whitelisted).transfer(admin.address, amount)
      ).to.be.revertedWithCustomError(rewards, "OperationNotAllowed");
    });
  });

  describe("Reward Collection", function () {
    it("Should revert collect if no reward is assigned", async function () {
      const { rewards, nonWhitelisted } = await loadFixture(deployFixture);
      await rewards.setCollection();
      await expect(
        rewards.connect(nonWhitelisted).collect()
      ).to.be.revertedWithCustomError(rewards, "NothingToCollect");
    });

    it("Should collect rOVAV2 reward and mint tokens", async function () {
      const { rewards, whitelisted } = await loadFixture(deployFixture);
      await rewards.setCollection();
      const amount = ethers.parseEther("50");
      await rewards.add(whitelisted.address, amount);
      // Before collection, the rOVAV2 balance should be 0.
      expect(await rewards.balanceOf(whitelisted.address)).to.equal(0);
      await expect(rewards.connect(whitelisted).collect())
        .to.emit(rewards, "RewardCollected")
        .withArgs(whitelisted.address, amount);
      expect(await rewards.balanceOf(whitelisted.address)).to.equal(amount);
      // After collection, the allowed rOVAV2 amount should be reset to 0.
      expect(await rewards.allowedROva(whitelisted.address)).to.equal(0);
    });

    it("Should not collect rOVAV2 reward if not enabled", async function () {
      const { rewards, whitelisted } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("50");
      await rewards.add(whitelisted.address, amount);
      // Before collection, the rOVAV2 balance should be 0.
      expect(await rewards.balanceOf(whitelisted.address)).to.equal(0);
      await expect(
        rewards.connect(whitelisted).collect()
      ).to.be.revertedWithCustomError(rewards, "OperationNotAllowed");
      // After collection, the allowed rOVAV2 amount should not be reset to 0.
      expect(await rewards.allowedROva(whitelisted.address)).to.equal(amount);
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
