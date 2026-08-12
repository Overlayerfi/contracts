import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Overlayer OG", function () {
  const BASE_URI = "ipfs://overlayer-og/";
  const INITIAL_ROYALTY_BPS = 500;
  const MAX_SUPPLY = 2_000;
  const MINT_PRICE = ethers.parseEther("0.005");
  const BONUS_DENOMINATOR = 100;
  const WHITELIST_MINT_DURATION = 14 * 24 * 60 * 60;

  function merkleLeaf(account: string): string {
    const encodedAccount = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address"],
      [account]
    );
    return ethers.keccak256(ethers.keccak256(encodedAccount));
  }

  function hashPair(first: string, second: string): string {
    return ethers.keccak256(
      BigInt(first) < BigInt(second)
        ? ethers.concat([first, second])
        : ethers.concat([second, first])
    );
  }

  function buildMerkleTree(accounts: string[]) {
    const layers: string[][] = [accounts.map(merkleLeaf)];
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
      proofFor(account: string): string[] {
        let index = accounts.indexOf(account);
        if (index === -1) {
          throw new Error("Account is not in the Merkle tree");
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

  async function deployOgFixture() {
    const [owner, minter, buyer, anotherMinter, feeCollector] =
      await ethers.getSigners();
    const mintStartTime = await time.latest();
    const OverlayerOG = await ethers.getContractFactory("OverlayerOG");
    const og = await OverlayerOG.deploy(
      owner.address,
      BASE_URI,
      owner.address,
      INITIAL_ROYALTY_BPS,
      feeCollector.address,
      mintStartTime
    );
    await og.waitForDeployment();

    return {
      og,
      owner,
      minter,
      buyer,
      anotherMinter,
      feeCollector,
      mintStartTime
    };
  }

  it("deploys with a 14-day whitelist window, fixed 0.005 ETH price, and 2k cap", async function () {
    const { og, owner, feeCollector, mintStartTime } = await loadFixture(
      deployOgFixture
    );

    expect(await og.name()).to.equal("Overlayer OG");
    expect(await og.symbol()).to.equal("Overlayer OG");
    expect(await og.feeCollector()).to.equal(feeCollector.address);
    expect(await og.mintPrice()).to.equal(MINT_PRICE);
    expect(await og.MINT_PRICE()).to.equal(MINT_PRICE);
    expect(await og.initialMintPrice()).to.equal(MINT_PRICE);
    expect(await og.priceIncrement()).to.equal(0);
    expect(await og.maxSupply()).to.equal(MAX_SUPPLY);
    expect(await og.bonusNumerator()).to.equal(0);
    expect(await og.bonusDenominator()).to.equal(BONUS_DENOMINATOR);
    expect(await og.mintStartTime()).to.equal(mintStartTime);
    expect(await og.mintEndTime()).to.equal(
      mintStartTime + WHITELIST_MINT_DURATION
    );
    expect(await og.publicMintStartTime()).to.equal(0);
    expect(await og.isPublicMintOpen()).to.equal(false);
    expect(await og.owner()).to.equal(owner.address);
  });

  it("charges 0.005 ETH for Merkle-whitelisted mintWithProof claims", async function () {
    const { og, owner, minter, buyer, anotherMinter, feeCollector } =
      await loadFixture(deployOgFixture);
    const tree = buildMerkleTree([minter.address, anotherMinter.address]);

    await expect(og.connect(owner).setMerkleRoot(tree.root))
      .to.emit(og, "MerkleRootUpdated")
      .withArgs(tree.root);

    const minterProof = tree.proofFor(minter.address);
    expect(await og.isMerkleWhitelisted(minter.address, minterProof)).to.equal(
      true
    );
    expect(await og.isMerkleWhitelisted(buyer.address, minterProof)).to.equal(
      false
    );

    await expect(
      og.connect(buyer).mintWithProof(minterProof, { value: MINT_PRICE })
    ).to.be.revertedWithCustomError(og, "InvalidMerkleProof");
    await expect(
      og.connect(minter).mintWithProof(minterProof)
    ).to.be.revertedWithCustomError(og, "InsufficientMintPayment");

    const overpayment = ethers.parseEther("0.01");
    const collectorBefore = await ethers.provider.getBalance(
      feeCollector.address
    );
    await expect(
      og.connect(minter).mintWithProof(minterProof, { value: overpayment })
    )
      .to.emit(og, "Minted")
      .withArgs(minter.address, 1)
      .and.to.emit(og, "MintPaymentCollected")
      .withArgs(minter.address, feeCollector.address, MINT_PRICE)
      .and.to.emit(og, "MintPaymentRefunded")
      .withArgs(minter.address, overpayment - MINT_PRICE);

    expect(await og.ownerOf(1)).to.equal(minter.address);
    expect(await og.tokenURI(1)).to.equal(`${BASE_URI}1`);
    expect(await og.hasMinted(minter.address)).to.equal(true);
    expect(await og.mintPrice()).to.equal(MINT_PRICE);
    expect(await ethers.provider.getBalance(feeCollector.address)).to.equal(
      collectorBefore + MINT_PRICE
    );

    await expect(
      og.connect(minter).mintWithProof(minterProof, { value: MINT_PRICE })
    ).to.be.revertedWithCustomError(og, "AlreadyMinted");
  });

  it("mints for free against the secondary Merkle free-mint allowlist", async function () {
    const { og, owner, minter, buyer, anotherMinter, feeCollector } =
      await loadFixture(deployOgFixture);
    const tree = buildMerkleTree([minter.address, anotherMinter.address]);

    await expect(
      og.connect(minter).setFreeMintMerkleRoot(tree.root)
    ).to.be.revertedWithCustomError(og, "OwnableUnauthorizedAccount");
    await expect(og.connect(owner).setFreeMintMerkleRoot(tree.root))
      .to.emit(og, "FreeMintMerkleRootUpdated")
      .withArgs(tree.root);

    const minterProof = tree.proofFor(minter.address);
    expect(
      await og.isFreeMintMerkleWhitelisted(minter.address, minterProof)
    ).to.equal(true);
    expect(
      await og.isFreeMintMerkleWhitelisted(buyer.address, minterProof)
    ).to.equal(false);

    await expect(
      og.connect(buyer).mintWithFreeMintProof(minterProof)
    ).to.be.revertedWithCustomError(og, "InvalidMerkleProof");

    const collectorBefore = await ethers.provider.getBalance(
      feeCollector.address
    );
    const leftover = ethers.parseEther("0.5");
    await expect(
      og.connect(minter).mintWithFreeMintProof(minterProof, { value: leftover })
    )
      .to.emit(og, "Minted")
      .withArgs(minter.address, 1)
      .and.to.emit(og, "MintPaymentRefunded")
      .withArgs(minter.address, leftover)
      .and.to.not.emit(og, "MintPaymentCollected");

    expect(await og.ownerOf(1)).to.equal(minter.address);
    expect(await og.hasMinted(minter.address)).to.equal(true);
    expect(await ethers.provider.getBalance(feeCollector.address)).to.equal(
      collectorBefore
    );

    await expect(
      og.connect(minter).mintWithFreeMintProof(minterProof)
    ).to.be.revertedWithCustomError(og, "AlreadyMinted");
  });

  it("keeps paid and free Merkle trees independent", async function () {
    const { og, owner, minter, anotherMinter } = await loadFixture(
      deployOgFixture
    );
    const paidTree = buildMerkleTree([minter.address]);
    const freeTree = buildMerkleTree([anotherMinter.address]);

    await og.connect(owner).setMerkleRoot(paidTree.root);
    await og.connect(owner).setFreeMintMerkleRoot(freeTree.root);

    const paidProof = paidTree.proofFor(minter.address);
    const freeProof = freeTree.proofFor(anotherMinter.address);

    await expect(
      og.connect(minter).mintWithFreeMintProof(paidProof)
    ).to.be.revertedWithCustomError(og, "InvalidMerkleProof");
    await expect(
      og.connect(anotherMinter).mintWithProof(freeProof, { value: MINT_PRICE })
    ).to.be.revertedWithCustomError(og, "InvalidMerkleProof");

    await og.connect(minter).mintWithProof(paidProof, { value: MINT_PRICE });
    await og.connect(anotherMinter).mintWithFreeMintProof(freeProof);

    expect(await og.ownerOf(1)).to.equal(minter.address);
    expect(await og.ownerOf(2)).to.equal(anotherMinter.address);
  });

  it("charges mapping-whitelisted minters the same fixed price", async function () {
    const { og, owner, minter, buyer, feeCollector } = await loadFixture(
      deployOgFixture
    );

    await expect(
      og.connect(buyer).mint({ value: MINT_PRICE })
    ).to.be.revertedWithCustomError(og, "NotWhitelisted");

    await og.connect(owner).setWhitelist(minter.address, true);
    const collectorBefore = await ethers.provider.getBalance(
      feeCollector.address
    );
    await expect(og.connect(minter).mint({ value: MINT_PRICE }))
      .to.emit(og, "Minted")
      .withArgs(minter.address, 1)
      .and.to.emit(og, "MintPaymentCollected")
      .withArgs(minter.address, feeCollector.address, MINT_PRICE);
    expect(await ethers.provider.getBalance(feeCollector.address)).to.equal(
      collectorBefore + MINT_PRICE
    );
  });

  it("rejects mints before start and after the 14-day window", async function () {
    const [owner, minter, buyer, feeCollector] = await ethers.getSigners();
    const mintStartTime = (await time.latest()) + 3_600;
    const OverlayerOG = await ethers.getContractFactory("OverlayerOG");
    const og = await OverlayerOG.deploy(
      owner.address,
      BASE_URI,
      owner.address,
      INITIAL_ROYALTY_BPS,
      feeCollector.address,
      mintStartTime
    );
    await og.waitForDeployment();

    await og.connect(owner).setWhitelist(minter.address, true);
    await og.connect(owner).setMerkleRoot(merkleLeaf(buyer.address));
    await og.connect(owner).setFreeMintMerkleRoot(merkleLeaf(owner.address));

    await expect(
      og.connect(minter).mint({ value: MINT_PRICE })
    ).to.be.revertedWithCustomError(og, "MintNotStarted");
    await expect(
      og.connect(buyer).mintWithProof([], { value: MINT_PRICE })
    ).to.be.revertedWithCustomError(og, "MintNotStarted");
    await expect(
      og.connect(owner).mintWithFreeMintProof([])
    ).to.be.revertedWithCustomError(og, "MintNotStarted");

    await time.increaseTo(mintStartTime);
    await og.connect(minter).mint({ value: MINT_PRICE });
    await og.connect(buyer).mintWithProof([], { value: MINT_PRICE });

    await time.increaseTo(mintStartTime + WHITELIST_MINT_DURATION);
    expect(await og.isPublicMintOpen()).to.equal(false);
    await expect(
      og.connect(owner).mintWithFreeMintProof([])
    ).to.be.revertedWithCustomError(og, "MintEnded");
    await expect(
      og.connect(owner).mint({ value: MINT_PRICE })
    ).to.be.revertedWithCustomError(og, "MintEnded");
  });

  it("pauses every mint path including free-mint Merkle claims", async function () {
    const { og, owner, minter, buyer, anotherMinter } = await loadFixture(
      deployOgFixture
    );

    await og.connect(owner).setWhitelist(minter.address, true);
    await og.connect(owner).setMerkleRoot(merkleLeaf(buyer.address));
    await og
      .connect(owner)
      .setFreeMintMerkleRoot(merkleLeaf(anotherMinter.address));
    await og.connect(owner).pause();

    await expect(
      og.connect(minter).mint({ value: MINT_PRICE })
    ).to.be.revertedWithCustomError(og, "EnforcedPause");
    await expect(
      og.connect(buyer).mintWithProof([], { value: MINT_PRICE })
    ).to.be.revertedWithCustomError(og, "EnforcedPause");
    await expect(
      og.connect(anotherMinter).mintWithFreeMintProof([])
    ).to.be.revertedWithCustomError(og, "EnforcedPause");

    await og.connect(owner).unpause();
    await og.connect(anotherMinter).mintWithFreeMintProof([]);
    expect(await og.ownerOf(1)).to.equal(anotherMinter.address);
  });

  it("allows approvals but prevents every token transfer", async function () {
    const { og, owner, minter, buyer } = await loadFixture(deployOgFixture);

    await og.connect(owner).setFreeMintWhitelist(minter.address, true);
    await og.connect(minter).mint();
    await og.connect(minter).approve(buyer.address, 1);

    await expect(
      og.connect(buyer).transferFrom(minter.address, buyer.address, 1)
    ).to.be.revertedWithCustomError(og, "NonTransferable");
    await expect(
      og
        .connect(minter)
        ["safeTransferFrom(address,address,uint256)"](
          minter.address,
          buyer.address,
          1
        )
    ).to.be.revertedWithCustomError(og, "NonTransferable");

    expect(await og.ownerOf(1)).to.equal(minter.address);
    expect(await og.getApproved(1)).to.equal(buyer.address);
  });

  it("rejects burns from owner and approved operator", async function () {
    const { og, owner, minter, buyer } = await loadFixture(deployOgFixture);

    await og.connect(owner).setFreeMintWhitelist(minter.address, true);
    await og.connect(minter).mint();
    await og.connect(minter).approve(buyer.address, 1);

    await expect(og.connect(minter).burn(1)).to.be.revertedWithCustomError(
      og,
      "NonBurnable"
    );
    await expect(og.connect(buyer).burn(1)).to.be.revertedWithCustomError(
      og,
      "NonBurnable"
    );
    await expect(
      og.connect(minter).burnBatch([1])
    ).to.be.revertedWithCustomError(og, "NonBurnable");

    expect(await og.ownerOf(1)).to.equal(minter.address);
    expect(await og.balanceOf(minter.address)).to.equal(1);
  });
});
