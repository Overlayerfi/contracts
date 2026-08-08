import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

// IOverlayerReferral.ReferralType
const ReferralType = {
  None: 0n,
  Team: 1n,
  Ref: 2n
} as const;

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
          .addCode("CODE", await alice.getAddress(), ReferralType.Team)
      ).to.emit(overlayerReferral, "NewCode");
      expect(await overlayerReferral.referralCodes("CODE")).to.be.equal(
        await alice.getAddress()
      );
      expect(
        await overlayerReferral.referralCodesByType(
          await alice.getAddress(),
          ReferralType.Team
        )
      ).to.be.equal("CODE");
      expect(await overlayerReferral.referralCodeTypes("CODE")).to.equal(
        ReferralType.Team
      );

      // Same type again for same holder is rejected
      await expect(
        overlayerReferral
          .connect(admin)
          .addCode("CODE2", await alice.getAddress(), ReferralType.Team)
      ).to.be.eventually.rejected;

      // Duplicate code string is rejected
      await expect(
        overlayerReferral
          .connect(admin)
          .addCode("CODE", await alice.getAddress(), ReferralType.Ref)
      ).to.be.eventually.rejected;

      // Other type for same holder is allowed
      await expect(
        await overlayerReferral
          .connect(admin)
          .addCode("CODE_REF", await alice.getAddress(), ReferralType.Ref)
      ).to.emit(overlayerReferral, "NewCode");

      expect((await overlayerReferral.allCodes())[0]).to.be.equal("CODE");
    });

    it("Should reject empty and invalid referral types", async function () {
      const { overlayerReferral, admin, alice, bob } = await loadFixture(
        deployFixture
      );

      await expect(
        overlayerReferral
          .connect(admin)
          .addCode("", await alice.getAddress(), ReferralType.Team)
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralCodeNotValid"
      );

      await expect(
        overlayerReferral.connect(bob).addCodeSelf("", ReferralType.Team)
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralCodeNotValid"
      );

      await expect(
        overlayerReferral
          .connect(admin)
          .addCode("X", await alice.getAddress(), ReferralType.None)
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralInvalidType"
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
          .addCode("ALICE", await alice.getAddress(), ReferralType.Team)
      ).to.emit(overlayerReferral, "NewCode");
      await expect(
        await overlayerReferral.connect(bob).consumeReferral("ALICE")
      ).to.emit(overlayerReferral, "Referral");

      // Not refer self
      await expect(overlayerReferral.connect(alice).consumeReferral("ALICE")).to
        .be.eventually.rejected;

      expect(
        await overlayerReferral.referredFromByType(
          bob.address,
          ReferralType.Team
        )
      ).to.be.equal(alice.address);
      const referred = await overlayerReferral.seeReferredByType(
        alice.address,
        ReferralType.Team
      );
      expect(referred.length).to.be.equal(1);
      expect(referred[0]).to.be.equal(bob.address);

      // Cannot create same type after consuming it
      await expect(
        overlayerReferral.connect(bob).addCodeSelf("BOB", ReferralType.Team)
      ).to.be.eventually.rejected;

      // Can create the other type
      await expect(
        await overlayerReferral
          .connect(bob)
          .addCodeSelf("BOB_REF", ReferralType.Ref)
      ).to.emit(overlayerReferral, "NewCode");
    });

    it("Should prevent duplicate referral registrations for the same type", async function () {
      const { overlayerReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      await overlayerReferral.connect(admin).addPointsTracker(admin.address);
      await expect(
        await overlayerReferral
          .connect(admin)
          .addCode("ALICE", await alice.getAddress(), ReferralType.Team)
      ).to.emit(overlayerReferral, "NewCode");
      await expect(
        await overlayerReferral.connect(bob).consumeReferral("ALICE")
      ).to.emit(overlayerReferral, "Referral");
      await expect(overlayerReferral.connect(bob).consumeReferral("ALICE")).to
        .be.eventually.rejected;
    });

    it("Should enforce create/consume exclusivity per type only", async function () {
      const { overlayerReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      await overlayerReferral.connect(admin).addPointsTracker(admin.address);
      await expect(
        await overlayerReferral
          .connect(admin)
          .addCode("ALICE_TEAM", await alice.getAddress(), ReferralType.Team)
      ).to.emit(overlayerReferral, "NewCode");
      await expect(
        await overlayerReferral
          .connect(admin)
          .addCode("BOB_TEAM", await bob.getAddress(), ReferralType.Team)
      ).to.emit(overlayerReferral, "NewCode");
      await expect(
        await overlayerReferral
          .connect(admin)
          .addCode("BOB_REF", await bob.getAddress(), ReferralType.Ref)
      ).to.emit(overlayerReferral, "NewCode");

      // Alice created A, cannot consume A
      await expect(overlayerReferral.connect(alice).consumeReferral("BOB_TEAM"))
        .to.be.eventually.rejected;

      // Alice can consume B
      await expect(
        await overlayerReferral.connect(alice).consumeReferral("BOB_REF")
      ).to.emit(overlayerReferral, "Referral");
      expect(
        await overlayerReferral.referredFromByType(
          alice.address,
          ReferralType.Ref
        )
      ).to.equal(bob.address);

      // Alice cannot create B after consuming B
      await expect(
        overlayerReferral
          .connect(admin)
          .addCode("ALICE_REF", await alice.getAddress(), ReferralType.Ref)
      ).to.be.eventually.rejected;
    });

    it("Should allow independent A and B relationships for the same user", async function () {
      const { overlayerReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      const [, , , , carol] = await ethers.getSigners();
      await overlayerReferral.connect(admin).addPointsTracker(admin.address);

      await overlayerReferral
        .connect(admin)
        .addCode("ALICE_TEAM", alice.address, ReferralType.Team);
      await overlayerReferral
        .connect(admin)
        .addCode("BOB_REF", bob.address, ReferralType.Ref);

      await overlayerReferral.connect(carol).consumeReferral("ALICE_TEAM");
      await overlayerReferral.connect(carol).consumeReferral("BOB_REF");

      expect(
        await overlayerReferral.referredFromByType(
          carol.address,
          ReferralType.Team
        )
      ).to.equal(alice.address);
      expect(
        await overlayerReferral.referredFromByType(
          carol.address,
          ReferralType.Ref
        )
      ).to.equal(bob.address);
    });

    it("Should validate referral source address", async function () {
      const { overlayerReferral, admin } = await loadFixture(deployFixture);
      await overlayerReferral.connect(admin).addPointsTracker(admin.address);
      await expect(
        overlayerReferral
          .connect(admin)
          .addCode("ALICE", ethers.ZeroAddress, ReferralType.Team)
      ).to.be.eventually.rejected;
    });

    it("Should reject Ref consume when consumer already holds reward tokens", async function () {
      const { overlayerReferral, admin, minter, bob, alice } =
        await loadFixture(deployFixture);
      await overlayerReferral
        .connect(admin)
        .addCode("BOB_REF", bob.address, ReferralType.Ref);

      await overlayerReferral
        .connect(minter)
        .mint(alice.address, ethers.parseEther("1"));

      await expect(
        overlayerReferral.connect(alice).consumeReferral("BOB_REF")
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralNotFresh"
      );
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
