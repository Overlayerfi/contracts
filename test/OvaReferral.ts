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

    const Liquidity = await ethers.getContractFactory("Liquidity");
    const liquidity = await Liquidity.deploy(
      admin.address,
      defaultTransactionOptions
    );

    await ovaReferral.setStakingPools([await liquidity.getAddress()]);

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

  describe("StakingPools", function () {
    it("Should add staking pools", async function () {
      const { ovaReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      await ovaReferral
        .connect(admin)
        .setStakingPools([alice.address, bob.address]);
      const pools = await ovaReferral.getStakingPools();
      expect(pools).to.deep.equal([alice.address, bob.address]);
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

  describe("Code", function () {
    it("Should add a new refarral code", async function () {
      const { ovaReferral, admin, alice } = await loadFixture(deployFixture);
      await expect(
        await ovaReferral
          .connect(admin)
          .addCode("CODE", await alice.getAddress())
      ).to.emit(ovaReferral, "NewCode");
      expect(await ovaReferral.referralCodes("CODE")).to.be.equal(
        await alice.getAddress()
      );
      expect(
        await ovaReferral.referralCodesRev(await alice.getAddress())
      ).to.be.equal("CODE");

      await expect(
        ovaReferral.connect(admin).addCode("CODE2", await alice.getAddress())
      ).to.be.eventually.rejected;

      await expect(
        ovaReferral.connect(admin).addCode("CODE", await alice.getAddress())
      ).to.be.eventually.rejected;

      expect((await ovaReferral.allCodes())[0]).to.be.equal("CODE");
    });
  });

  describe("Referral", function () {
    it("Should add new referral", async function () {
      const { ovaReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      await ovaReferral.connect(admin).addPointsTracker(admin.address);
      await expect(
        await ovaReferral
          .connect(admin)
          .addCode("ALICE", await alice.getAddress())
      ).to.emit(ovaReferral, "NewCode");
      await expect(
        await ovaReferral.connect(bob).consumeReferral("ALICE")
      ).to.emit(ovaReferral, "Referral");

      // Not refer self
      await expect(ovaReferral.connect(alice).consumeReferral("ALICE")).to.be
        .eventually.rejected;

      expect(await ovaReferral.referredFrom(bob.address)).to.be.equal(
        alice.address
      );
      const referred = await ovaReferral.seeReferred(alice.address);
      expect(referred.length).to.be.equal(1);
      expect(referred[0]).to.be.equal(bob.address);

      // Add self code
      await expect(await ovaReferral.connect(bob).addCodeSelf("BOB")).to.emit(
        ovaReferral,
        "NewCode"
      );
    });

    it("Should not use referral if has given one", async function () {
      const { ovaReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      await ovaReferral.connect(admin).addPointsTracker(admin.address);
      await expect(
        await ovaReferral
          .connect(admin)
          .addCode("ALICE", await alice.getAddress())
      ).to.emit(ovaReferral, "NewCode");
      await expect(
        await ovaReferral.connect(admin).addCode("BOB", await bob.getAddress())
      ).to.emit(ovaReferral, "NewCode");
      await expect(ovaReferral.connect(alice).consumeReferral("BOB")).to.be
        .eventually.rejected;
    });

    it("Should not be referred multiple times", async function () {
      const { ovaReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      await ovaReferral.connect(admin).addPointsTracker(admin.address);
      await expect(
        await ovaReferral
          .connect(admin)
          .addCode("ALICE", await alice.getAddress())
      ).to.emit(ovaReferral, "NewCode");
      await expect(
        await ovaReferral.connect(bob).consumeReferral("ALICE")
      ).to.emit(ovaReferral, "Referral");
      await expect(ovaReferral.connect(bob).consumeReferral("ALICE")).to.be
        .eventually.rejected;
    });

    it("Should not be referred from zero address", async function () {
      const { ovaReferral, admin } = await loadFixture(deployFixture);
      await ovaReferral.connect(admin).addPointsTracker(admin.address);
      await expect(
        ovaReferral.connect(admin).addCode("ALICE", ethers.ZeroAddress)
      ).to.be.eventually.rejected;
    });
  });

  describe("Trackers", function () {
    it("Should add and remove new tracker", async function () {
      const { ovaReferral, admin, minter } = await loadFixture(deployFixture);
      await expect(
        await ovaReferral.connect(admin).addPointsTracker(minter.address)
      ).to.emit(ovaReferral, "AddTracker");

      expect(
        await ovaReferral.allowedPointsTrackers(minter.address)
      ).to.be.equal(true);

      await expect(
        await ovaReferral.connect(admin).removePointsTracker(minter.address)
      ).to.emit(ovaReferral, "RemoveTracker");

      expect(
        await ovaReferral.allowedPointsTrackers(minter.address)
      ).to.be.equal(false);
    });

    it("Should not add new tracker if not admin", async function () {
      const { ovaReferral, minter } = await loadFixture(deployFixture);
      await expect(ovaReferral.connect(minter).addPointsTracker(minter.address))
        .to.be.eventually.rejected;
    });
  });
});
