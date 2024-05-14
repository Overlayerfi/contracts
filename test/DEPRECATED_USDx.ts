import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("USDO", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [admin, alice, bob] = await ethers.getSigners();

    const Contract = await ethers.getContractFactory("USDO");
    const contract = await Contract.deploy(await admin.getAddress());

    return { contract, admin, alice, bob };
  }

  describe("Deployment", function () {
    it("Should set the owner", async function () {
      const { contract, admin, alice, bob } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      const aliceAddress = await alice.getAddress();
      expect(await contract.owner()).to.equal(adminAddress);
      expect(await contract.owner()).to.not.equal(aliceAddress);
    });
  });

  describe("Set Minter", function () {
    it("Should set the minter", async function () {
      const { contract, admin, alice, bob } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      const aliceAddress = await alice.getAddress();
      await expect(
        await contract.connect(admin).setMinter(aliceAddress)
      ).to.emit(contract, "MinterUpdated");
      expect(await contract.minter()).to.equal(aliceAddress);
      expect(await contract.minter()).to.not.equal(adminAddress);
    });
  });

  describe("Mint", function () {
    it("Should mint to", async function () {
      const { contract, admin, alice, bob } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      await contract.connect(admin).setMinter(aliceAddress);
      await expect(
        await contract.connect(alice).mint(bobAddress, ethers.parseEther("1"))
      ).to.emit(contract, "Transfer");
      expect(await contract.balanceOf(bobAddress)).to.equal(
        ethers.parseEther("1")
      );
      expect(await contract.balanceOf(adminAddress)).to.equal(
        ethers.parseEther("0")
      );
      expect(await contract.balanceOf(aliceAddress)).to.equal(
        ethers.parseEther("0")
      );
    });
  });

  describe("Burn", function () {
    it("Should burn from", async function () {
      const { contract, admin, alice, bob } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      await contract.connect(admin).setMinter(aliceAddress);
      await contract.connect(alice).mint(bobAddress, ethers.parseEther("1"));
      expect(await contract.balanceOf(bobAddress)).to.equal(
        ethers.parseEther("1")
      );
      await contract.connect(bob).approve(adminAddress, ethers.parseEther("1"));
      await contract
        .connect(admin)
        .burnFrom(bobAddress, ethers.parseEther("1"));
      expect(await contract.balanceOf(bobAddress)).to.equal(
        ethers.parseEther("0")
      );
    });
  });

  describe("Approve Collateral", function () {
    it("Should approve an external spender", async function () {
      const { contract, admin, alice, bob } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      await contract.connect(admin).setMinter(aliceAddress);
      await contract.connect(alice).mint(bobAddress, ethers.parseEther("1"));
      expect(await contract.balanceOf(bobAddress)).to.equal(
        ethers.parseEther("1")
      );
      await contract.connect(bob).approve(adminAddress, ethers.parseEther("1"));
      await contract
        .connect(admin)
        .burnFrom(bobAddress, ethers.parseEther("1"));
      expect(await contract.balanceOf(bobAddress)).to.equal(
        ethers.parseEther("0")
      );
    });
  });
});
