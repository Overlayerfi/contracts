import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("OVA Token", function () {
  async function deployFixture() {
    const [admin, minter, bob] = await ethers.getSigners();

    const block = await admin.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const defaultTransactionOptions = {
      maxFeePerGas: baseFee * BigInt(10)
    };

    const OVA = await ethers.getContractFactory("OVA");
    const liquidityAirdropReward = await OVA.deploy(
      admin.address,
      defaultTransactionOptions
    );

    await liquidityAirdropReward.waitForDeployment();
    await liquidityAirdropReward.connect(admin).setMinter(minter.address);

    return { liquidityAirdropReward, admin, minter, bob };
  }

  describe("Access Control", function () {
    it("Should correctly set admin role during deployment", async function () {
      const { liquidityAirdropReward, admin } = await loadFixture(
        deployFixture
      );
      const adminAddress = await admin.getAddress();
      expect(await liquidityAirdropReward.owner()).to.equal(adminAddress);
    });

    it("Should correctly assign minter role to designated address", async function () {
      const { liquidityAirdropReward, minter } = await loadFixture(
        deployFixture
      );
      expect(await liquidityAirdropReward.minter(minter.address)).to.equal(
        true
      );
    });
  });

  describe("Token Minting", function () {
    it("Should allow minter to mint tokens to specified address", async function () {
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
});
