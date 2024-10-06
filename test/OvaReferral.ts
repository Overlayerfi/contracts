import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("OvaReferral", function () {
  async function deployFixture() {
    const [admin, minter, bob, alice] = await ethers.getSigners();

    const block = await admin.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const defaultTransactionOptions = {
      maxFeePerGas: baseFee * BigInt(10)
    };

    const OvaReferral = await ethers.getContractFactory("OvaReferral");
    const ovaReferral = await OvaReferral.deploy(
      admin.address,
      defaultTransactionOptions
    );

    await ovaReferral.waitForDeployment();
    await ovaReferral.connect(admin).setMinter(minter.address);

    return { ovaReferral, admin, minter, bob, alice };
  }

  describe("Deployment & Minter", function () {
    it("Should set the admin role", async function () {
      const { ovaReferral, admin } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      expect(await ovaReferral.owner()).to.equal(adminAddress);
    });

    it("Should set the minter role", async function () {
      const { ovaReferral, minter } = await loadFixture(deployFixture);
      expect(await ovaReferral.minter(minter.address)).to.equal(true);
    });
  });

  describe("Mint", function () {
    it("Should mint", async function () {
      const { ovaReferral, minter, bob } = await loadFixture(deployFixture);
      expect(await ovaReferral.balanceOf(bob.address)).to.equal(
        ethers.parseEther("0")
      );
      await expect(
        await ovaReferral
          .connect(minter)
          .mint(bob.address, ethers.parseEther("10"))
      ).to.emit(ovaReferral, "Transfer");
      expect(await ovaReferral.balanceOf(bob.address)).to.equal(
        ethers.parseEther("10")
      );
    });
  });

  describe("Referrral", function () {
    it("Should add new referral", async function () {
      const { ovaReferral, bob, alice } = await loadFixture(deployFixture);
      await expect(
        await ovaReferral.connect(bob).consumeReferral(alice.address)
      ).to.emit(ovaReferral, "Referral");

      expect(await ovaReferral.referredFrom(bob.address)).to.be.equal(
        alice.address
      );
      const referred = await ovaReferral.seeReferred(alice.address);
      expect(referred.length).to.be.equal(1);
      expect(referred[0]).to.be.equal(bob.address);
    });

    it("Should not be referred multiple times", async function () {
      const { ovaReferral, minter, bob, alice } = await loadFixture(
        deployFixture
      );
      await expect(
        await ovaReferral.connect(bob).consumeReferral(alice.address)
      ).to.emit(ovaReferral, "Referral");
      await expect(ovaReferral.connect(bob).consumeReferral(minter.address)).to
        .be.eventually.rejected;
    });

    it("Should not be referred from zero address", async function () {
      const { ovaReferral, bob } = await loadFixture(deployFixture);
      await expect(ovaReferral.connect(bob).consumeReferral(ethers.ZeroAddress))
        .to.be.eventually.rejected;
    });
  });
});
