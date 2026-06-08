import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

describe("Overlayer Referral System", function () {
  async function deployFixture() {
    const [admin, minter, bob, alice] = await ethers.getSigners();

    const block = await admin.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const defaultTransactionOptions = {
      maxFeePerGas: baseFee * BigInt(10)
    };

    const OverlayerReferral = await ethers.getContractFactory(
      "OverlayerReferral"
    );
    const overlayerReferral = await OverlayerReferral.deploy(
      admin.address,
      defaultTransactionOptions
    );

    const Liquidity = await ethers.getContractFactory("Liquidity");
    const liquidity = await Liquidity.deploy(
      admin.address,
      defaultTransactionOptions
    );

    await overlayerReferral.setStakingPools([await liquidity.getAddress()]);

    await overlayerReferral.waitForDeployment();
    await overlayerReferral.connect(admin).setMinter(minter.address);

    return { overlayerReferral, admin, minter, bob, alice };
  }

  describe("Authorization Management", function () {
    it("Should correctly assign initial admin role", async function () {
      const { overlayerReferral, admin } = await loadFixture(deployFixture);
      const adminAddress = await admin.getAddress();
      expect(await overlayerReferral.owner()).to.equal(adminAddress);
    });

    it("Should properly configure minter privileges", async function () {
      const { overlayerReferral, minter } = await loadFixture(deployFixture);
      expect(await overlayerReferral.minter(minter.address)).to.equal(true);
    });
  });

  describe("Staking Pool Configuration", function () {
    it("Should register multiple staking pool addresses", async function () {
      const { overlayerReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      await overlayerReferral
        .connect(admin)
        .setStakingPools([alice.address, bob.address]);
      const pools = await overlayerReferral.getStakingPools();
      expect(pools).to.deep.equal([alice.address, bob.address]);
    });
  });

  describe("Token Operations", function () {
    it("Should allow authorized minting of tokens", async function () {
      const { overlayerReferral, minter, bob } = await loadFixture(
        deployFixture
      );
      expect(await overlayerReferral.balanceOf(bob.address)).to.equal(
        ethers.parseEther("0")
      );
      await expect(
        await overlayerReferral
          .connect(minter)
          .mint(bob.address, ethers.parseEther("10"))
      ).to.emit(overlayerReferral, "Transfer");
      expect(await overlayerReferral.balanceOf(bob.address)).to.equal(
        ethers.parseEther("10")
      );
    });
  });

  describe("Referral Code Management", function () {
    it("Should register new referral codes with proper validation", async function () {
      const { overlayerReferral, admin, alice } = await loadFixture(
        deployFixture
      );
      await expect(
        await overlayerReferral
          .connect(admin)
          .addCode("CODE", await alice.getAddress())
      ).to.emit(overlayerReferral, "NewCode");
      expect(await overlayerReferral.referralCodes("CODE")).to.be.equal(
        await alice.getAddress()
      );
      expect(
        await overlayerReferral.referralCodesRev(await alice.getAddress())
      ).to.be.equal("CODE");

      await expect(
        overlayerReferral
          .connect(admin)
          .addCode("CODE2", await alice.getAddress())
      ).to.be.eventually.rejected;

      await expect(
        overlayerReferral
          .connect(admin)
          .addCode("CODE", await alice.getAddress())
      ).to.be.eventually.rejected;

      expect((await overlayerReferral.allCodes())[0]).to.be.equal("CODE");
    });

    it("Should reject empty referral codes", async function () {
      const { overlayerReferral, admin, alice, bob } = await loadFixture(
        deployFixture
      );

      await expect(
        overlayerReferral
          .connect(admin)
          .addCode("", await alice.getAddress())
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralCodeNotValid"
      );

      await expect(
        overlayerReferral.connect(bob).addCodeSelf("")
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralCodeNotValid"
      );
    });
  });

  describe("Referral Processing", function () {
    it("Should process new referral relationships correctly", async function () {
      const { overlayerReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      await overlayerReferral.connect(admin).addPointsTracker(admin.address);
      await expect(
        await overlayerReferral
          .connect(admin)
          .addCode("ALICE", await alice.getAddress())
      ).to.emit(overlayerReferral, "NewCode");
      await expect(
        await overlayerReferral.connect(bob).consumeReferral("ALICE")
      ).to.emit(overlayerReferral, "Referral");

      // Not refer self
      await expect(overlayerReferral.connect(alice).consumeReferral("ALICE")).to
        .be.eventually.rejected;

      expect(await overlayerReferral.referredFrom(bob.address)).to.be.equal(
        alice.address
      );
      const referred = await overlayerReferral.seeReferred(alice.address);
      expect(referred.length).to.be.equal(1);
      expect(referred[0]).to.be.equal(bob.address);

      // Add self code
      await expect(overlayerReferral.connect(bob).addCodeSelf("BOB")).to.be
        .eventually.rejected;
    });

    it("Should prevent duplicate referral registrations", async function () {
      const { overlayerReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      await overlayerReferral.connect(admin).addPointsTracker(admin.address);
      await expect(
        await overlayerReferral
          .connect(admin)
          .addCode("ALICE", await alice.getAddress())
      ).to.emit(overlayerReferral, "NewCode");
      await expect(
        await overlayerReferral.connect(bob).consumeReferral("ALICE")
      ).to.emit(overlayerReferral, "Referral");
      await expect(overlayerReferral.connect(bob).consumeReferral("ALICE")).to
        .be.eventually.rejected;
    });

    it("Should enforce single referral per address", async function () {
      const { overlayerReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      await overlayerReferral.connect(admin).addPointsTracker(admin.address);
      await expect(
        await overlayerReferral
          .connect(admin)
          .addCode("ALICE", await alice.getAddress())
      ).to.emit(overlayerReferral, "NewCode");
      await expect(
        await overlayerReferral
          .connect(admin)
          .addCode("BOB", await bob.getAddress())
      ).to.emit(overlayerReferral, "NewCode");
      await expect(overlayerReferral.connect(alice).consumeReferral("BOB")).to
        .be.eventually.rejected;
    });

    it("Should validate referral source address", async function () {
      const { overlayerReferral, admin } = await loadFixture(deployFixture);
      await overlayerReferral.connect(admin).addPointsTracker(admin.address);
      await expect(
        overlayerReferral.connect(admin).addCode("ALICE", ethers.ZeroAddress)
      ).to.be.eventually.rejected;
    });
  });

  describe("Points Tracking System", function () {
    it("Should register authorized points tracking contracts", async function () {
      const { overlayerReferral, admin, minter } = await loadFixture(
        deployFixture
      );
      await expect(
        await overlayerReferral.connect(admin).addPointsTracker(minter.address)
      ).to.emit(overlayerReferral, "AddTracker");

      expect(
        await overlayerReferral.allowedPointsTrackers(minter.address)
      ).to.be.equal(true);

      await expect(
        await overlayerReferral
          .connect(admin)
          .removePointsTracker(minter.address)
      ).to.emit(overlayerReferral, "RemoveTracker");

      expect(
        await overlayerReferral.allowedPointsTrackers(minter.address)
      ).to.be.equal(false);
    });

    it("Should restrict tracker registration to admin", async function () {
      const { overlayerReferral, minter } = await loadFixture(deployFixture);
      await expect(
        overlayerReferral.connect(minter).addPointsTracker(minter.address)
      ).to.be.eventually.rejected;
    });
  });
});
