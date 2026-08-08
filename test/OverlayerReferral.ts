import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

// IOverlayerReferral.ReferralType
const ReferralType = {
  None: 0n,
  Team: 1n,
  Ref: 2n
} as const;

function pointsMerkleLeaf(account: string, amount: bigint): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint256"],
    [account, amount]
  );
  return ethers.keccak256(ethers.keccak256(encoded));
}

function hashPair(first: string, second: string): string {
  return ethers.keccak256(
    BigInt(first) < BigInt(second)
      ? ethers.concat([first, second])
      : ethers.concat([second, first])
  );
}

function buildPointsMerkleTree(entries: { account: string; amount: bigint }[]) {
  const sorted = [...entries].sort((a, b) => {
    const byAddr = a.account
      .toLowerCase()
      .localeCompare(b.account.toLowerCase());
    if (byAddr !== 0) return byAddr;
    return a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0;
  });
  const leaves = sorted.map((e) => pointsMerkleLeaf(e.account, e.amount));
  const layers: string[][] = [leaves];
  let currentLayer = layers[0];

  while (currentLayer.length > 1) {
    const nextLayer: string[] = [];
    for (let index = 0; index < currentLayer.length; index += 2) {
      const left = currentLayer[index];
      const right = currentLayer[index + 1] ?? left;
      nextLayer.push(hashPair(left, right));
    }
    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  return {
    root: currentLayer[0],
    proofFor(account: string, amount: bigint): string[] {
      let index = sorted.findIndex(
        (e) =>
          e.account.toLowerCase() === account.toLowerCase() &&
          e.amount === amount
      );
      if (index === -1) {
        throw new Error("Entry is not in the Merkle tree");
      }
      const proof: string[] = [];
      for (let layerIndex = 0; layerIndex < layers.length - 1; ++layerIndex) {
        const layer = layers[layerIndex];
        const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
        proof.push(layer[siblingIndex] ?? layer[index]);
        index = Math.floor(index / 2);
      }
      return proof;
    }
  };
}

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

    it("Should allow burn but reject peer transfers", async function () {
      const { overlayerReferral, minter, bob, alice } = await loadFixture(
        deployFixture
      );
      const amount = ethers.parseEther("10");
      await overlayerReferral.connect(minter).mint(bob.address, amount);

      await expect(
        overlayerReferral.connect(bob).transfer(alice.address, amount)
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralNonTransferable"
      );

      await expect(overlayerReferral.connect(bob).burn(amount)).to.emit(
        overlayerReferral,
        "Transfer"
      );
      expect(await overlayerReferral.balanceOf(bob.address)).to.equal(0);
    });

    it("Should let users claim OVERP via Merkle allocation proofs", async function () {
      const { overlayerReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      const bobAmt = ethers.parseEther("5");
      const aliceAmt = ethers.parseEther("12");
      const tree = buildPointsMerkleTree([
        { account: bob.address, amount: bobAmt },
        { account: alice.address, amount: aliceAmt }
      ]);

      await expect(
        overlayerReferral.connect(admin).setPointsMerkleRoot(tree.root)
      )
        .to.emit(overlayerReferral, "PointsMerkleRootUpdated")
        .withArgs(tree.root);

      const bobProof = tree.proofFor(bob.address, bobAmt);
      expect(
        await overlayerReferral.canClaimPoints(bob.address, bobAmt, bobProof)
      ).to.equal(true);

      await expect(overlayerReferral.connect(bob).claimPoints(bobAmt, bobProof))
        .to.emit(overlayerReferral, "PointsClaimed")
        .withArgs(bob.address, bobAmt, tree.root);
      expect(await overlayerReferral.balanceOf(bob.address)).to.equal(bobAmt);
      expect(
        await overlayerReferral.hasClaimedPoints(tree.root, bob.address)
      ).to.equal(true);

      await expect(
        overlayerReferral.connect(bob).claimPoints(bobAmt, bobProof)
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralAlreadyClaimed"
      );

      await expect(
        overlayerReferral
          .connect(alice)
          .claimPoints(bobAmt, tree.proofFor(alice.address, aliceAmt))
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralInvalidMerkleProof"
      );

      await overlayerReferral
        .connect(alice)
        .claimPoints(aliceAmt, tree.proofFor(alice.address, aliceAmt));
      expect(await overlayerReferral.balanceOf(alice.address)).to.equal(
        aliceAmt
      );
      expect(
        await overlayerReferral.canClaimPoints(
          alice.address,
          aliceAmt,
          tree.proofFor(alice.address, aliceAmt)
        )
      ).to.equal(false);
    });

    it("Should enforce Merkle claim edge cases and root rotation", async function () {
      const { overlayerReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      const amount = ethers.parseEther("3");
      const tree = buildPointsMerkleTree([{ account: bob.address, amount }]);
      const proof = tree.proofFor(bob.address, amount);

      // Unset root
      await expect(
        overlayerReferral.connect(bob).claimPoints(amount, proof)
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralInvalidMerkleProof"
      );
      expect(
        await overlayerReferral.canClaimPoints(bob.address, amount, proof)
      ).to.equal(false);

      // Non-owner cannot set root
      await expect(
        overlayerReferral.connect(bob).setPointsMerkleRoot(tree.root)
      ).to.be.rejected;

      await overlayerReferral.connect(admin).setPointsMerkleRoot(tree.root);

      // Zero amount
      await expect(
        overlayerReferral.connect(bob).claimPoints(0n, proof)
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralZeroAmount"
      );

      // Leaf parity with on-chain helper
      expect(
        await overlayerReferral.pointsMerkleLeaf(bob.address, amount)
      ).to.equal(pointsMerkleLeaf(bob.address, amount));

      // Single-leaf tree (empty proof) claim
      await overlayerReferral.connect(bob).claimPoints(amount, proof);
      expect(await overlayerReferral.balanceOf(bob.address)).to.equal(amount);

      // New root campaign allows a fresh claim for another allocation
      const aliceAmt = ethers.parseEther("7");
      const nextTree = buildPointsMerkleTree([
        { account: alice.address, amount: aliceAmt }
      ]);
      await overlayerReferral.connect(admin).setPointsMerkleRoot(nextTree.root);
      await overlayerReferral
        .connect(alice)
        .claimPoints(aliceAmt, nextTree.proofFor(alice.address, aliceAmt));
      expect(await overlayerReferral.balanceOf(alice.address)).to.equal(
        aliceAmt
      );

      // Clearing root disables claims
      await overlayerReferral
        .connect(admin)
        .setPointsMerkleRoot(ethers.ZeroHash);
      await expect(
        overlayerReferral
          .connect(alice)
          .claimPoints(aliceAmt, nextTree.proofFor(alice.address, aliceAmt))
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralInvalidMerkleProof"
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
      // Teams start closed; open so bob can join
      await overlayerReferral.connect(alice).setTeamOpen(true);
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
      await overlayerReferral.connect(alice).setTeamOpen(true);
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

      await overlayerReferral.connect(alice).setTeamOpen(true);
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

  describe("Team open/closed and whitelist", function () {
    it("Should start closed and reject non-whitelisted Team consume", async function () {
      const { overlayerReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      await overlayerReferral
        .connect(admin)
        .addCode("ALICE", alice.address, ReferralType.Team);

      expect(await overlayerReferral.isTeamOpen(alice.address)).to.equal(false);
      expect(
        await overlayerReferral.canJoinTeam(alice.address, bob.address)
      ).to.equal(false);

      await expect(
        overlayerReferral.connect(bob).consumeReferral("ALICE")
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralNotWhitelisted"
      );
    });

    it("Should allow Team consume after whitelist or open", async function () {
      const { overlayerReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      const [, , , , carol] = await ethers.getSigners();

      await overlayerReferral
        .connect(admin)
        .addCode("ALICE", alice.address, ReferralType.Team);

      await expect(
        await overlayerReferral
          .connect(alice)
          .setTeamWhitelist(bob.address, true)
      ).to.emit(overlayerReferral, "TeamWhitelistUpdated");

      expect(
        await overlayerReferral.isTeamWhitelisted(alice.address, bob.address)
      ).to.equal(true);
      expect(
        await overlayerReferral.canJoinTeam(alice.address, bob.address)
      ).to.equal(true);

      await expect(
        await overlayerReferral.connect(bob).consumeReferral("ALICE")
      ).to.emit(overlayerReferral, "Referral");

      // Open team allows anyone else without whitelist
      await expect(
        await overlayerReferral.connect(alice).setTeamOpen(true)
      ).to.emit(overlayerReferral, "TeamOpenUpdated");
      expect(await overlayerReferral.isTeamOpen(alice.address)).to.equal(true);
      expect(
        await overlayerReferral.canJoinTeam(alice.address, carol.address)
      ).to.equal(true);

      await expect(
        await overlayerReferral.connect(carol).consumeReferral("ALICE")
      ).to.emit(overlayerReferral, "Referral");
      const referred = await overlayerReferral.seeReferredByType(
        alice.address,
        ReferralType.Team
      );
      expect(referred).to.deep.equal([bob.address, carol.address]);
    });

    it("Should support batch whitelist and restore closed gate", async function () {
      const { overlayerReferral, admin, minter, bob, alice } =
        await loadFixture(deployFixture);
      const [, , , , carol] = await ethers.getSigners();

      await overlayerReferral
        .connect(admin)
        .addCode("ALICE", alice.address, ReferralType.Team);

      await overlayerReferral
        .connect(alice)
        .batchSetTeamWhitelist([bob.address, carol.address], true);

      expect(
        await overlayerReferral.isTeamWhitelisted(alice.address, bob.address)
      ).to.equal(true);
      expect(
        await overlayerReferral.isTeamWhitelisted(alice.address, carol.address)
      ).to.equal(true);

      await overlayerReferral.connect(bob).consumeReferral("ALICE");

      // Close remains default; unwhitelisted minter cannot join
      await expect(
        overlayerReferral.connect(minter).consumeReferral("ALICE")
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralNotWhitelisted"
      );

      // Open then close restores whitelist gate
      await overlayerReferral.connect(alice).setTeamOpen(true);
      await overlayerReferral.connect(alice).setTeamOpen(false);
      await expect(
        overlayerReferral.connect(minter).consumeReferral("ALICE")
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralNotWhitelisted"
      );
      await overlayerReferral
        .connect(alice)
        .setTeamWhitelist(minter.address, true);
      await expect(
        await overlayerReferral.connect(minter).consumeReferral("ALICE")
      ).to.emit(overlayerReferral, "Referral");
    });

    it("Should reject non-owner team management and keep joined after unwhitelist", async function () {
      const { overlayerReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );

      await overlayerReferral
        .connect(admin)
        .addCode("ALICE", alice.address, ReferralType.Team);

      await expect(
        overlayerReferral.connect(bob).setTeamOpen(true)
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralNotTeamOwner"
      );
      await expect(
        overlayerReferral.connect(bob).setTeamWhitelist(bob.address, true)
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralNotTeamOwner"
      );

      await overlayerReferral
        .connect(alice)
        .setTeamWhitelist(bob.address, true);
      await overlayerReferral.connect(bob).consumeReferral("ALICE");

      await overlayerReferral
        .connect(alice)
        .setTeamWhitelist(bob.address, false);
      await overlayerReferral.connect(alice).setTeamOpen(false);

      expect(
        await overlayerReferral.referredFromByType(
          bob.address,
          ReferralType.Team
        )
      ).to.equal(alice.address);
      expect(
        await overlayerReferral.isTeamWhitelisted(alice.address, bob.address)
      ).to.equal(false);
    });

    it("Should ignore team open/whitelist for Ref consume", async function () {
      const { overlayerReferral, admin, bob, alice } = await loadFixture(
        deployFixture
      );
      await overlayerReferral
        .connect(admin)
        .addCode("BOB_REF", bob.address, ReferralType.Ref);

      // No team open/whitelist needed for Ref
      await expect(
        await overlayerReferral.connect(alice).consumeReferral("BOB_REF")
      ).to.emit(overlayerReferral, "Referral");
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

    it("Should track Team and Ref points separately with total as sum", async function () {
      const { overlayerReferral, admin, alice, bob } = await loadFixture(
        deployFixture
      );
      await overlayerReferral.connect(admin).addPointsTracker(admin.address);
      await overlayerReferral
        .connect(admin)
        .addCode("ALICE_TEAM", alice.address, ReferralType.Team);
      await overlayerReferral
        .connect(admin)
        .addCode("ALICE_REF", alice.address, ReferralType.Ref);

      const teamPts = ethers.parseEther("3");
      const refPts = ethers.parseEther("2");
      await overlayerReferral
        .connect(admin)
        .track(alice.address, teamPts, ReferralType.Team);
      await overlayerReferral
        .connect(admin)
        .track(alice.address, refPts, ReferralType.Ref);

      expect(
        await overlayerReferral.generatedPointsByType(
          alice.address,
          ReferralType.Team
        )
      ).to.equal(teamPts);
      expect(
        await overlayerReferral.generatedPointsByType(
          alice.address,
          ReferralType.Ref
        )
      ).to.equal(refPts);
      expect(await overlayerReferral.generatedPoints(alice.address)).to.equal(
        teamPts + refPts
      );
      expect(await overlayerReferral.codeTotalPoints("ALICE_TEAM")).to.equal(
        teamPts
      );
      expect(await overlayerReferral.codeTotalPoints("ALICE_REF")).to.equal(
        refPts
      );

      await expect(
        overlayerReferral
          .connect(admin)
          .track(bob.address, 1n, ReferralType.None)
      ).to.be.revertedWithCustomError(
        overlayerReferral,
        "OverlayerReferralInvalidType"
      );
    });
  });
});
