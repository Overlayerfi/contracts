import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("LiquidityAirdropReward", function () {
  async function deployFixture() {
    const [admin, minter, bob] = await ethers.getSigners();

    const block = await admin.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const defaultTransactionOptions = {
      maxFeePerGas: baseFee * BigInt(10)
    };

    const LiquidityAirdropReward = await ethers.getContractFactory(
      "LiquidityAirdropReward"
    );
    const liquidityAirdropReward = await LiquidityAirdropReward.deploy(
      admin.address,
      defaultTransactionOptions
    );

    await liquidityAirdropReward.waitForDeployment();
    await liquidityAirdropReward.connect(admin).setMinter(minter.address);

    return { liquidityAirdropReward, admin, minter, bob };
  }

  describe("Deployment & Minter", function () {
    it("Should set the admin role", async function () {
      const { liquidityAirdropReward, admin } = await loadFixture(
        deployFixture
      );
      const adminAddress = await admin.getAddress();
      expect(await liquidityAirdropReward.owner()).to.equal(adminAddress);
    });

    it("Should set the minter role", async function () {
      const { liquidityAirdropReward, minter } = await loadFixture(
        deployFixture
      );
      expect(await liquidityAirdropReward.minter(minter.address)).to.equal(
        true
      );
    });
  });

  describe("Mint", function () {
    it("Should mint", async function () {
      const { liquidityAirdropReward, minter, bob } = await loadFixture(
        deployFixture
      );
      expect(await liquidityAirdropReward.balanceOf(bob.address)).to.equal(
        ethers.parseEther("0")
      );
      await expect(
        await liquidityAirdropReward
          .connect(minter)
          .mint(bob.address, ethers.parseEther("10"))
      ).to.emit(liquidityAirdropReward, "Transfer");
      expect(await liquidityAirdropReward.balanceOf(bob.address)).to.equal(
        ethers.parseEther("10")
      );
    });
  });

  describe("Transfer", function () {
    it("Should not be transferable", async function () {
      const { liquidityAirdropReward, minter, bob } = await loadFixture(
        deployFixture
      );
      expect(await liquidityAirdropReward.balanceOf(bob.address)).to.equal(
        ethers.parseEther("0")
      );
      await expect(
        await liquidityAirdropReward
          .connect(minter)
          .mint(bob.address, ethers.parseEther("10"))
      ).to.emit(liquidityAirdropReward, "Transfer");
      expect(await liquidityAirdropReward.balanceOf(bob.address)).to.equal(
        ethers.parseEther("10")
      );
      await expect(
        liquidityAirdropReward
          .connect(minter)
          .transfer(bob.address, ethers.parseEther("1"))
      ).to.be.eventually.rejected;
    });
  });
});
