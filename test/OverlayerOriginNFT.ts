import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Overlayer Origin NFT collections", function () {
  const BASE_URI = "ipfs://overlayer-origin/";
  const INITIAL_ROYALTY_BPS = 500;
  const SHRIMP_MAX_SUPPLY = 20_000;
  const SHRIMP_BONUS_NUMERATOR = 1;
  const DOLPHIN_MAX_SUPPLY = 1_500;
  const DOLPHIN_BONUS_NUMERATOR = 5;
  const WHALE_MAX_SUPPLY = 500;
  const WHALE_BONUS_NUMERATOR = 10;
  const BONUS_DENOMINATOR = 100;
  const DOLPHIN_INITIAL_PRICE = ethers.parseEther("0.01");
  const DOLPHIN_PRICE_INCREMENT = ethers.parseEther("0.0003");
  const WHALE_INITIAL_PRICE = ethers.parseEther("0.03");
  const WHALE_PRICE_INCREMENT = ethers.parseEther("0.001");
  const PRICE_UNIT_DELTA = 25;
  const WHITELIST_MINT_DURATION = 14 * 24 * 60 * 60;

  function shrimpDeploymentConfig(
    initialOwner: string,
    royaltyReceiver: string,
    royaltyFeeNumerator: number,
    mintStartTime: number,
    maxSupply = SHRIMP_MAX_SUPPLY,
    bonusNumerator = SHRIMP_BONUS_NUMERATOR
  ) {
    return {
      initialOwner,
      baseURI: BASE_URI,
      royaltyReceiver,
      royaltyFeeNumerator,
      maxSupply,
      bonusNumerator,
      mintStartTime
    };
  }

  function dolphinDeploymentConfig(
    initialOwner: string,
    royaltyReceiver: string,
    royaltyFeeNumerator: number,
    feeCollector: string,
    mintStartTime: number,
    maxSupply = DOLPHIN_MAX_SUPPLY,
    bonusNumerator = DOLPHIN_BONUS_NUMERATOR
  ) {
    return {
      initialOwner,
      baseURI: BASE_URI,
      royaltyReceiver,
      royaltyFeeNumerator,
      feeCollector,
      initialMintPrice: DOLPHIN_INITIAL_PRICE,
      priceIncrement: DOLPHIN_PRICE_INCREMENT,
      priceUnitDelta: PRICE_UNIT_DELTA,
      maxSupply,
      bonusNumerator,
      mintStartTime
    };
  }

  function whaleDeploymentConfig(
    initialOwner: string,
    royaltyReceiver: string,
    royaltyFeeNumerator: number,
    feeCollector: string,
    mintStartTime: number,
    maxSupply = WHALE_MAX_SUPPLY,
    bonusNumerator = WHALE_BONUS_NUMERATOR
  ) {
    return {
      initialOwner,
      baseURI: BASE_URI,
      royaltyReceiver,
      royaltyFeeNumerator,
      feeCollector,
      initialMintPrice: WHALE_INITIAL_PRICE,
      priceIncrement: WHALE_PRICE_INCREMENT,
      priceUnitDelta: PRICE_UNIT_DELTA,
      maxSupply,
      bonusNumerator,
      mintStartTime
    };
  }

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

  function testAccount(index: number): string {
    return ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(index), 20));
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

  async function deployShrimpFixture() {
    const [owner, minter, buyer, anotherMinter, operator] =
      await ethers.getSigners();
    const mintStartTime = await time.latest();
    const Shrimp = await ethers.getContractFactory("OverlayerOriginShrimp");
    const shrim = await Shrimp.deploy(
      shrimpDeploymentConfig(
        owner.address,
        owner.address,
        INITIAL_ROYALTY_BPS,
        mintStartTime
      )
    );
    await shrim.waitForDeployment();

    return {
      shrim,
      owner,
      minter,
      buyer,
      anotherMinter,
      operator,
      mintStartTime
    };
  }

  it("deploys Shrimp with its fixed metadata and owner", async function () {
    const { shrim, owner, mintStartTime } = await loadFixture(
      deployShrimpFixture
    );

    expect(await shrim.name()).to.equal("Overlayer Origin Shrimp");
    expect(await shrim.symbol()).to.equal("Overlayer Origin Shrimp");
    expect(await shrim.owner()).to.equal(owner.address);
    expect(await shrim.maxSupply()).to.equal(SHRIMP_MAX_SUPPLY);
    const [shrimpBonusNumerator, shrimpBonusDenominator] = await shrim.bonus();
    expect(shrimpBonusNumerator).to.equal(SHRIMP_BONUS_NUMERATOR);
    expect(shrimpBonusDenominator).to.equal(BONUS_DENOMINATOR);
    expect(await shrim.bonusNumerator()).to.equal(shrimpBonusNumerator);
    expect(await shrim.bonusDenominator()).to.equal(shrimpBonusDenominator);
    expect(await shrim.mintStartTime()).to.equal(mintStartTime);
    expect(await shrim.mintEndTime()).to.equal(
      mintStartTime + WHITELIST_MINT_DURATION
    );
    expect(await shrim.publicMintStartTime()).to.equal(0);
    expect(await shrim.supportsInterface("0x80ac58cd")).to.equal(true);
    expect(await shrim.supportsInterface("0x2a55205a")).to.equal(true);
  });

  it("uses supply and bonus values supplied at deployment", async function () {
    const [owner] = await ethers.getSigners();
    const mintStartTime = await time.latest();
    const Shrimp = await ethers.getContractFactory("OverlayerOriginShrimp");
    const Dolphin = await ethers.getContractFactory("OverlayerOriginDolphin");
    const Whale = await ethers.getContractFactory("OverlayerOriginWhale");

    const shrim = await Shrimp.deploy(
      shrimpDeploymentConfig(
        owner.address,
        ethers.ZeroAddress,
        0,
        mintStartTime,
        20,
        2
      )
    );
    const dolphin = await Dolphin.deploy(
      dolphinDeploymentConfig(
        owner.address,
        ethers.ZeroAddress,
        0,
        owner.address,
        mintStartTime,
        30,
        6
      )
    );
    const whale = await Whale.deploy(
      whaleDeploymentConfig(
        owner.address,
        ethers.ZeroAddress,
        0,
        owner.address,
        mintStartTime,
        40,
        11
      )
    );
    await Promise.all([
      shrim.waitForDeployment(),
      dolphin.waitForDeployment(),
      whale.waitForDeployment()
    ]);

    expect(await shrim.maxSupply()).to.equal(20);
    expect(await shrim.bonusNumerator()).to.equal(2);
    expect(await dolphin.maxSupply()).to.equal(30);
    expect(await dolphin.bonusNumerator()).to.equal(6);
    expect(await whale.maxSupply()).to.equal(40);
    expect(await whale.bonusNumerator()).to.equal(11);
  });

  it("allows only the owner to manage the allowlist", async function () {
    const { shrim, owner, minter, buyer, anotherMinter } = await loadFixture(
      deployShrimpFixture
    );

    await expect(
      shrim.connect(minter).setWhitelist(minter.address, true)
    ).to.be.revertedWithCustomError(shrim, "OwnableUnauthorizedAccount");

    await expect(
      shrim.connect(owner).setWhitelist(ethers.ZeroAddress, true)
    ).to.be.revertedWithCustomError(shrim, "ZeroAddress");

    await expect(
      shrim
        .connect(owner)
        .batchSetWhitelist([minter.address, anotherMinter.address], true)
    )
      .to.emit(shrim, "WhitelistUpdated")
      .withArgs(minter.address, true)
      .and.to.emit(shrim, "WhitelistUpdated")
      .withArgs(anotherMinter.address, true);

    expect(await shrim.whitelisted(minter.address)).to.equal(true);
    expect(await shrim.whitelisted(anotherMinter.address)).to.equal(true);
    expect(await shrim.whitelisted(buyer.address)).to.equal(false);
  });

  it("mints one local primary token per allowlisted address", async function () {
    const { shrim, owner, minter, buyer, anotherMinter } = await loadFixture(
      deployShrimpFixture
    );

    await expect(shrim.connect(buyer).mint()).to.be.revertedWithCustomError(
      shrim,
      "NotWhitelisted"
    );

    await shrim
      .connect(owner)
      .batchSetWhitelist([minter.address, anotherMinter.address], true);
    await expect(shrim.connect(minter).mint())
      .to.emit(shrim, "Minted")
      .withArgs(minter.address, 1);
    await expect(shrim.connect(anotherMinter).mint())
      .to.emit(shrim, "Minted")
      .withArgs(anotherMinter.address, 2);

    expect(await shrim.ownerOf(1)).to.equal(minter.address);
    expect(await shrim.ownerOf(2)).to.equal(anotherMinter.address);
    expect(await shrim.tokenURI(1)).to.equal(`${BASE_URI}1`);
    expect(await shrim.tokenURI(2)).to.equal(`${BASE_URI}2`);
    expect(await shrim.hasMinted(minter.address)).to.equal(true);
    expect(await shrim.hasMinted(anotherMinter.address)).to.equal(true);
    expect(await shrim.nextTokenId()).to.equal(3);

    const updatedBaseURI = "https://metadata.overlayer.xyz/origin/";
    await shrim.connect(owner).setBaseURI(updatedBaseURI);
    expect(await shrim.tokenURI(1)).to.equal(`${updatedBaseURI}1`);
    expect(await shrim.tokenURI(2)).to.equal(`${updatedBaseURI}2`);

    await expect(shrim.connect(minter).mint()).to.be.revertedWithCustomError(
      shrim,
      "AlreadyMinted"
    );
  });

  it("enforces a lifetime supply cap without reopening slots after burns", async function () {
    const [owner, firstMinter, secondMinter, thirdMinter] =
      await ethers.getSigners();
    const maxSupply = 2;
    const OriginNFTMock = await ethers.getContractFactory(
      "OverlayerOriginNFTMock"
    );
    const nft = await OriginNFTMock.deploy(maxSupply);
    await nft.waitForDeployment();

    expect(await nft.maxSupply()).to.equal(maxSupply);
    await nft
      .connect(owner)
      .batchSetWhitelist(
        [firstMinter.address, secondMinter.address, thirdMinter.address],
        true
      );
    await nft.connect(firstMinter).mint();
    await nft.connect(secondMinter).mint();

    await expect(nft.connect(thirdMinter).mint())
      .to.be.revertedWithCustomError(nft, "MaxSupplyReached")
      .withArgs(maxSupply);

    await nft.connect(firstMinter).burn(1);
    await expect(nft.connect(thirdMinter).mint())
      .to.be.revertedWithCustomError(nft, "MaxSupplyReached")
      .withArgs(maxSupply);
  });

  it("lets the owner pause both allowlist mint paths", async function () {
    const { shrim, owner, minter, buyer } = await loadFixture(
      deployShrimpFixture
    );

    await shrim.connect(owner).setWhitelist(minter.address, true);
    await shrim.connect(owner).setMerkleRoot(merkleLeaf(buyer.address));

    await expect(shrim.connect(minter).pause()).to.be.revertedWithCustomError(
      shrim,
      "OwnableUnauthorizedAccount"
    );
    await expect(shrim.connect(owner).pause())
      .to.emit(shrim, "Paused")
      .withArgs(owner.address);
    expect(await shrim.paused()).to.equal(true);

    await expect(shrim.connect(minter).mint()).to.be.revertedWithCustomError(
      shrim,
      "EnforcedPause"
    );
    await expect(
      shrim.connect(buyer).mintWithProof([])
    ).to.be.revertedWithCustomError(shrim, "EnforcedPause");

    await expect(shrim.connect(owner).unpause())
      .to.emit(shrim, "Unpaused")
      .withArgs(owner.address);
    expect(await shrim.paused()).to.equal(false);

    await shrim.connect(minter).mint();
    await shrim.connect(buyer).mintWithProof([]);
  });

  it("rejects direct and Merkle mints until the configured start time", async function () {
    const [owner, minter, buyer] = await ethers.getSigners();
    const mintStartTime = (await time.latest()) + 3_600;
    const Shrimp = await ethers.getContractFactory("OverlayerOriginShrimp");
    const shrim = await Shrimp.deploy(
      shrimpDeploymentConfig(
        owner.address,
        owner.address,
        INITIAL_ROYALTY_BPS,
        mintStartTime
      )
    );
    await shrim.waitForDeployment();

    await shrim.connect(owner).setWhitelist(minter.address, true);
    await shrim.connect(owner).setMerkleRoot(merkleLeaf(buyer.address));

    expect(await shrim.mintStartTime()).to.equal(mintStartTime);
    await expect(shrim.connect(minter).mint()).to.be.revertedWithCustomError(
      shrim,
      "MintNotStarted"
    );
    await expect(
      shrim.connect(buyer).mintWithProof([])
    ).to.be.revertedWithCustomError(shrim, "MintNotStarted");

    await time.increaseTo(mintStartTime);
    await expect(shrim.connect(minter).mint())
      .to.emit(shrim, "Minted")
      .withArgs(minter.address, 1);
    await expect(shrim.connect(buyer).mintWithProof([]))
      .to.emit(shrim, "Minted")
      .withArgs(buyer.address, 2);
  });

  it("closes Shrimp mints after its 14-day whitelist window", async function () {
    const { shrim, owner, minter, buyer, mintStartTime } = await loadFixture(
      deployShrimpFixture
    );
    const mintEndTime = mintStartTime + WHITELIST_MINT_DURATION;

    await shrim.connect(owner).setWhitelist(minter.address, true);
    await shrim.connect(owner).setMerkleRoot(merkleLeaf(buyer.address));
    await time.increaseTo(mintEndTime);

    expect(await shrim.mintEndTime()).to.equal(mintEndTime);
    await expect(shrim.connect(minter).mint()).to.be.revertedWithCustomError(
      shrim,
      "MintEnded"
    );
    await expect(
      shrim.connect(buyer).mintWithProof([])
    ).to.be.revertedWithCustomError(shrim, "MintEnded");
  });

  it("supports a replaceable Merkle allowlist for large campaigns", async function () {
    const { shrim, owner, minter, buyer, anotherMinter } = await loadFixture(
      deployShrimpFixture
    );
    const minterLeaf = merkleLeaf(minter.address);
    const anotherMinterLeaf = merkleLeaf(anotherMinter.address);
    const firstRoot = hashPair(minterLeaf, anotherMinterLeaf);

    await expect(shrim.connect(owner).setMerkleRoot(firstRoot))
      .to.emit(shrim, "MerkleRootUpdated")
      .withArgs(firstRoot);
    expect(
      await shrim.isMerkleWhitelisted(minter.address, [anotherMinterLeaf])
    ).to.equal(true);

    await shrim.connect(minter).mintWithProof([anotherMinterLeaf]);
    expect(await shrim.ownerOf(1)).to.equal(minter.address);

    await expect(
      shrim.connect(buyer).mintWithProof([minterLeaf])
    ).to.be.revertedWithCustomError(shrim, "InvalidMerkleProof");

    const buyerLeaf = merkleLeaf(buyer.address);
    await shrim.connect(owner).setMerkleRoot(buyerLeaf);
    await shrim.connect(buyer).mintWithProof([]);
    expect(await shrim.ownerOf(2)).to.equal(buyer.address);

    await shrim.connect(owner).setMerkleRoot(minterLeaf);
    await expect(
      shrim.connect(minter).mintWithProof([])
    ).to.be.revertedWithCustomError(shrim, "AlreadyMinted");
  });

  it("mints five claims from a 10,000-address Merkle allowlist", async function () {
    const { shrim, owner, minter, buyer, anotherMinter, operator } =
      await loadFixture(deployShrimpFixture);
    const claimants = [owner, minter, buyer, anotherMinter, operator];
    const accounts = claimants.map((claimant) => claimant.address);
    const accountSet = new Set(
      accounts.map((account) => account.toLowerCase())
    );

    for (let candidateNumber = 1; accounts.length < 10_000; ++candidateNumber) {
      const candidate = ethers.getAddress(
        ethers.zeroPadValue(ethers.toBeHex(candidateNumber), 20)
      );
      if (!accountSet.has(candidate.toLowerCase())) {
        accountSet.add(candidate.toLowerCase());
        accounts.push(candidate);
      }
    }

    const tree = buildMerkleTree(accounts);
    await shrim.connect(owner).setMerkleRoot(tree.root);

    for (let index = 0; index < claimants.length; ++index) {
      const claimant = claimants[index];
      const proof = tree.proofFor(claimant.address);

      expect(await shrim.isMerkleWhitelisted(claimant.address, proof)).to.equal(
        true
      );
      await expect(shrim.connect(claimant).mintWithProof(proof))
        .to.emit(shrim, "Minted")
        .withArgs(claimant.address, index + 1);
    }

    expect(await shrim.nextTokenId()).to.equal(6);
  });

  it("collects configured ETH mint fees and applies Dolphin and Whale price tiers", async function () {
    const { owner, minter, buyer, anotherMinter } = await loadFixture(
      deployShrimpFixture
    );
    const mintStartTime = await time.latest();
    const Dolphin = await ethers.getContractFactory("OverlayerOriginDolphin");
    const dolphin = await Dolphin.deploy(
      dolphinDeploymentConfig(
        owner.address,
        ethers.ZeroAddress,
        0,
        buyer.address,
        mintStartTime
      )
    );
    await dolphin.waitForDeployment();

    expect(await dolphin.feeCollector()).to.equal(buyer.address);
    expect(await dolphin.initialMintPrice()).to.equal(DOLPHIN_INITIAL_PRICE);
    expect(await dolphin.priceIncrement()).to.equal(DOLPHIN_PRICE_INCREMENT);
    expect(await dolphin.priceUnitDelta()).to.equal(PRICE_UNIT_DELTA);
    expect(await dolphin.maxSupply()).to.equal(DOLPHIN_MAX_SUPPLY);
    const [dolphinBonusNumerator, dolphinBonusDenominator] =
      await dolphin.bonus();
    expect(dolphinBonusNumerator).to.equal(DOLPHIN_BONUS_NUMERATOR);
    expect(dolphinBonusDenominator).to.equal(BONUS_DENOMINATOR);
    expect(await dolphin.bonusNumerator()).to.equal(dolphinBonusNumerator);
    expect(await dolphin.bonusDenominator()).to.equal(dolphinBonusDenominator);
    expect(await dolphin.mintStartTime()).to.equal(mintStartTime);
    expect(await dolphin.mintEndTime()).to.equal(
      mintStartTime + WHITELIST_MINT_DURATION * 2
    );
    expect(await dolphin.publicMintStartTime()).to.equal(
      mintStartTime + WHITELIST_MINT_DURATION
    );
    expect(await dolphin.mintPrice()).to.equal(DOLPHIN_INITIAL_PRICE);
    expect(await dolphin.mintPriceForTokenId(25)).to.equal(
      DOLPHIN_INITIAL_PRICE
    );
    expect(await dolphin.mintPriceForTokenId(26)).to.equal(
      DOLPHIN_INITIAL_PRICE + DOLPHIN_PRICE_INCREMENT
    );
    expect(await dolphin.mintPriceForTokenId(50)).to.equal(
      DOLPHIN_INITIAL_PRICE + DOLPHIN_PRICE_INCREMENT
    );
    expect(await dolphin.mintPriceForTokenId(51)).to.equal(
      DOLPHIN_INITIAL_PRICE + DOLPHIN_PRICE_INCREMENT * 2n
    );

    await dolphin.connect(owner).setWhitelist(minter.address, true);
    const excessPayment = ethers.parseEther("0.001");
    const collectorBalanceBefore = await ethers.provider.getBalance(
      buyer.address
    );
    await expect(
      dolphin
        .connect(minter)
        .mint({ value: DOLPHIN_INITIAL_PRICE + excessPayment })
    )
      .to.emit(dolphin, "MintPaymentCollected")
      .withArgs(minter.address, buyer.address, DOLPHIN_INITIAL_PRICE)
      .and.to.emit(dolphin, "MintPaymentRefunded")
      .withArgs(minter.address, excessPayment);
    expect(await ethers.provider.getBalance(buyer.address)).to.equal(
      collectorBalanceBefore + DOLPHIN_INITIAL_PRICE
    );
    expect(
      await ethers.provider.getBalance(await dolphin.getAddress())
    ).to.equal(0);

    await dolphin.connect(owner).setWhitelist(anotherMinter.address, true);
    await expect(
      dolphin.connect(anotherMinter).mint({ value: DOLPHIN_INITIAL_PRICE - 1n })
    )
      .to.be.revertedWithCustomError(dolphin, "InsufficientMintPayment")
      .withArgs(DOLPHIN_INITIAL_PRICE, DOLPHIN_INITIAL_PRICE - 1n);

    const Whale = await ethers.getContractFactory("OverlayerOriginWhale");
    const whale = await Whale.deploy(
      whaleDeploymentConfig(
        owner.address,
        ethers.ZeroAddress,
        0,
        buyer.address,
        mintStartTime
      )
    );
    await whale.waitForDeployment();

    expect(await whale.mintPrice()).to.equal(WHALE_INITIAL_PRICE);
    expect(await whale.maxSupply()).to.equal(WHALE_MAX_SUPPLY);
    const [whaleBonusNumerator, whaleBonusDenominator] = await whale.bonus();
    expect(whaleBonusNumerator).to.equal(WHALE_BONUS_NUMERATOR);
    expect(whaleBonusDenominator).to.equal(BONUS_DENOMINATOR);
    expect(await whale.bonusNumerator()).to.equal(whaleBonusNumerator);
    expect(await whale.bonusDenominator()).to.equal(whaleBonusDenominator);
    expect(await whale.mintPriceForTokenId(25)).to.equal(WHALE_INITIAL_PRICE);
    expect(await whale.mintPriceForTokenId(26)).to.equal(
      WHALE_INITIAL_PRICE + WHALE_PRICE_INCREMENT
    );
    expect(await whale.mintPriceForTokenId(51)).to.equal(
      WHALE_INITIAL_PRICE + WHALE_PRICE_INCREMENT * 2n
    );
    expect(await whale.mintEndTime()).to.equal(
      mintStartTime + WHITELIST_MINT_DURATION * 2
    );
    expect(await whale.publicMintStartTime()).to.equal(
      mintStartTime + WHITELIST_MINT_DURATION
    );
  });

  it("allows owner-managed free Dolphin and Whale mints that advance normal price tiers", async function () {
    const [owner, freeMinter, paidMinter, feeCollector] =
      await ethers.getSigners();
    const mintStartTime = await time.latest();
    const Dolphin = await ethers.getContractFactory("OverlayerOriginDolphin");
    const Whale = await ethers.getContractFactory("OverlayerOriginWhale");
    const dolphinConfig = dolphinDeploymentConfig(
      owner.address,
      ethers.ZeroAddress,
      0,
      feeCollector.address,
      mintStartTime
    );
    const whaleConfig = whaleDeploymentConfig(
      owner.address,
      ethers.ZeroAddress,
      0,
      feeCollector.address,
      mintStartTime
    );
    dolphinConfig.priceUnitDelta = 1;
    whaleConfig.priceUnitDelta = 1;

    const dolphin = await Dolphin.deploy(dolphinConfig);
    const whale = await Whale.deploy(whaleConfig);
    await Promise.all([dolphin.waitForDeployment(), whale.waitForDeployment()]);

    const freeMintOverpayment = ethers.parseEther("0.5");
    const collections = [
      {
        contract: dolphin,
        initialPrice: DOLPHIN_INITIAL_PRICE,
        increment: DOLPHIN_PRICE_INCREMENT
      },
      {
        contract: whale,
        initialPrice: WHALE_INITIAL_PRICE,
        increment: WHALE_PRICE_INCREMENT
      }
    ];

    for (const { contract, initialPrice, increment } of collections) {
      await expect(
        contract
          .connect(freeMinter)
          .setFreeMintWhitelist(freeMinter.address, true)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
      await expect(
        contract.connect(owner).setFreeMintWhitelist(ethers.ZeroAddress, true)
      ).to.be.revertedWithCustomError(contract, "ZeroAddress");
      await expect(
        contract
          .connect(owner)
          .batchSetFreeMintWhitelist([freeMinter.address], true)
      )
        .to.emit(contract, "FreeMintWhitelistUpdated")
        .withArgs(freeMinter.address, true);

      expect(await contract.whitelisted(freeMinter.address)).to.equal(false);
      expect(await contract.freeMintWhitelisted(freeMinter.address)).to.equal(
        true
      );
      expect(await contract.mintPriceForAccount(freeMinter.address)).to.equal(
        0
      );

      const collectorBalanceBeforeFreeMint = await ethers.provider.getBalance(
        feeCollector.address
      );
      await expect(
        contract.connect(freeMinter).mint({ value: freeMintOverpayment })
      )
        .to.emit(contract, "Minted")
        .withArgs(freeMinter.address, 1)
        .and.to.emit(contract, "MintPaymentRefunded")
        .withArgs(freeMinter.address, freeMintOverpayment);
      expect(await ethers.provider.getBalance(feeCollector.address)).to.equal(
        collectorBalanceBeforeFreeMint
      );
      expect(await contract.nextTokenId()).to.equal(2);
      expect(await contract.mintPrice()).to.equal(initialPrice + increment);
      expect(await contract.mintPriceForAccount(paidMinter.address)).to.equal(
        initialPrice + increment
      );

      await contract.connect(owner).setWhitelist(paidMinter.address, true);
      const collectorBalanceBeforePaidMint = await ethers.provider.getBalance(
        feeCollector.address
      );
      await expect(
        contract.connect(paidMinter).mint({ value: initialPrice + increment })
      )
        .to.emit(contract, "MintPaymentCollected")
        .withArgs(
          paidMinter.address,
          feeCollector.address,
          initialPrice + increment
        )
        .and.to.emit(contract, "Minted")
        .withArgs(paidMinter.address, 2);
      expect(await ethers.provider.getBalance(feeCollector.address)).to.equal(
        collectorBalanceBeforePaidMint + initialPrice + increment
      );
      expect(await contract.nextTokenId()).to.equal(3);
      expect(await contract.mintPrice()).to.equal(
        initialPrice + increment * 2n
      );
    }
  });

  it("opens Dolphin and Whale publicly for 14 days after their whitelist window", async function () {
    const [owner, minter, buyer] = await ethers.getSigners();
    const mintStartTime = await time.latest();
    const publicMintStartTime = mintStartTime + WHITELIST_MINT_DURATION;
    const mintEndTime = publicMintStartTime + WHITELIST_MINT_DURATION;
    const Dolphin = await ethers.getContractFactory("OverlayerOriginDolphin");
    const dolphin = await Dolphin.deploy(
      dolphinDeploymentConfig(
        owner.address,
        ethers.ZeroAddress,
        0,
        owner.address,
        mintStartTime
      )
    );
    const Whale = await ethers.getContractFactory("OverlayerOriginWhale");
    const whale = await Whale.deploy(
      whaleDeploymentConfig(
        owner.address,
        ethers.ZeroAddress,
        0,
        owner.address,
        mintStartTime
      )
    );
    await dolphin.waitForDeployment();
    await whale.waitForDeployment();

    await expect(
      dolphin.connect(buyer).mint({ value: DOLPHIN_INITIAL_PRICE })
    ).to.be.revertedWithCustomError(dolphin, "NotWhitelisted");
    await expect(
      whale.connect(buyer).mint({ value: WHALE_INITIAL_PRICE })
    ).to.be.revertedWithCustomError(whale, "NotWhitelisted");

    await dolphin.connect(owner).setWhitelist(minter.address, true);
    await whale.connect(owner).setWhitelist(minter.address, true);
    await dolphin.connect(minter).mint({ value: DOLPHIN_INITIAL_PRICE });
    await whale.connect(minter).mint({ value: WHALE_INITIAL_PRICE });

    await time.increaseTo(publicMintStartTime);
    expect(await dolphin.isPublicMintOpen()).to.equal(true);
    expect(await whale.isPublicMintOpen()).to.equal(true);
    expect(await dolphin.mintPrice()).to.equal(
      await dolphin.mintPriceForTokenId(2)
    );
    expect(await whale.mintPrice()).to.equal(
      await whale.mintPriceForTokenId(2)
    );

    await expect(dolphin.connect(buyer).mint({ value: DOLPHIN_INITIAL_PRICE }))
      .to.emit(dolphin, "Minted")
      .withArgs(buyer.address, 2);
    await expect(whale.connect(buyer).mint({ value: WHALE_INITIAL_PRICE }))
      .to.emit(whale, "Minted")
      .withArgs(buyer.address, 2);

    await time.increaseTo(mintEndTime);
    expect(await dolphin.isPublicMintOpen()).to.equal(false);
    expect(await whale.isPublicMintOpen()).to.equal(false);
    await expect(
      dolphin.connect(owner).mint({ value: DOLPHIN_INITIAL_PRICE })
    ).to.be.revertedWithCustomError(dolphin, "MintEnded");
    await expect(
      whale.connect(owner).mint({ value: WHALE_INITIAL_PRICE })
    ).to.be.revertedWithCustomError(whale, "MintEnded");
  });

  it("continues Dolphin price tiers from whitelist to public minting", async function () {
    const [owner] = await ethers.getSigners();
    const mintStartTime = await time.latest();
    const publicMintStartTime = mintStartTime + WHITELIST_MINT_DURATION;
    const Dolphin = await ethers.getContractFactory("OverlayerOriginDolphin");
    const dolphin = await Dolphin.deploy(
      dolphinDeploymentConfig(
        owner.address,
        ethers.ZeroAddress,
        0,
        owner.address,
        mintStartTime
      )
    );
    await dolphin.waitForDeployment();

    const mintFrom = async (account: string, value: bigint) => {
      await ethers.provider.send("hardhat_setBalance", [
        account,
        ethers.toBeHex(ethers.parseEther("1"))
      ]);
      await ethers.provider.send("hardhat_impersonateAccount", [account]);

      try {
        const signer = await ethers.getSigner(account);
        const transaction = await dolphin.connect(signer).mint({ value });
        await transaction.wait();
      } finally {
        await ethers.provider.send("hardhat_stopImpersonatingAccount", [
          account
        ]);
      }
    };

    const whitelistMinters = Array.from(
      { length: PRICE_UNIT_DELTA },
      (_, index) => testAccount(10_000 + index)
    );
    const publicMinters = Array.from({ length: PRICE_UNIT_DELTA }, (_, index) =>
      testAccount(20_000 + index)
    );
    const thirdTierMinter = testAccount(30_000);
    const secondTierPrice = DOLPHIN_INITIAL_PRICE + DOLPHIN_PRICE_INCREMENT;
    const thirdTierPrice = DOLPHIN_INITIAL_PRICE + DOLPHIN_PRICE_INCREMENT * 2n;

    await dolphin.connect(owner).batchSetWhitelist(whitelistMinters, true);
    const collectorBalanceBefore = await ethers.provider.getBalance(
      owner.address
    );
    for (const minter of whitelistMinters) {
      await mintFrom(minter, DOLPHIN_INITIAL_PRICE);
    }

    expect(await dolphin.nextTokenId()).to.equal(26);
    expect(await dolphin.mintPrice()).to.equal(secondTierPrice);
    await time.increaseTo(publicMintStartTime);

    for (const minter of publicMinters) {
      await mintFrom(minter, secondTierPrice);
    }

    expect(await dolphin.ownerOf(26)).to.equal(publicMinters[0]);
    expect(await dolphin.nextTokenId()).to.equal(51);
    expect(await dolphin.mintPrice()).to.equal(thirdTierPrice);
    expect(await ethers.provider.getBalance(owner.address)).to.equal(
      collectorBalanceBefore +
        BigInt(PRICE_UNIT_DELTA) * DOLPHIN_INITIAL_PRICE +
        BigInt(PRICE_UNIT_DELTA) * secondTierPrice
    );

    const collectorBalanceBeforeThirdTierMint =
      await ethers.provider.getBalance(owner.address);
    await mintFrom(thirdTierMinter, thirdTierPrice);

    expect(await dolphin.ownerOf(51)).to.equal(thirdTierMinter);
    expect(await ethers.provider.getBalance(owner.address)).to.equal(
      collectorBalanceBeforeThirdTierMint + thirdTierPrice
    );
  });

  it("keeps transfers and marketplace approvals unrestricted after minting", async function () {
    const { shrim, owner, minter, buyer, anotherMinter, operator } =
      await loadFixture(deployShrimpFixture);

    await shrim
      .connect(owner)
      .batchSetWhitelist([minter.address, anotherMinter.address], true);
    await shrim.connect(minter).mint();
    await shrim.connect(anotherMinter).mint();

    await shrim.connect(minter).approve(buyer.address, 1);
    expect(await shrim.getApproved(1)).to.equal(buyer.address);

    await shrim.connect(buyer).transferFrom(minter.address, buyer.address, 1);
    await shrim
      .connect(anotherMinter)
      .transferFrom(anotherMinter.address, buyer.address, 2);

    expect(await shrim.ownerOf(1)).to.equal(buyer.address);
    expect(await shrim.ownerOf(2)).to.equal(buyer.address);
    expect(await shrim.balanceOf(buyer.address)).to.equal(2);

    await shrim.connect(buyer).setApprovalForAll(operator.address, true);
    expect(
      await shrim.isApprovedForAll(buyer.address, operator.address)
    ).to.equal(true);
    await shrim
      .connect(operator)
      .transferFrom(buyer.address, minter.address, 1);
    expect(await shrim.ownerOf(1)).to.equal(minter.address);

    await expect(shrim.connect(minter).mint()).to.be.revertedWithCustomError(
      shrim,
      "AlreadyMinted"
    );
  });

  it("allows holders and approved operators to burn NFTs atomically", async function () {
    const { shrim, owner, minter, buyer, anotherMinter, operator } =
      await loadFixture(deployShrimpFixture);

    await shrim
      .connect(owner)
      .batchSetWhitelist(
        [minter.address, buyer.address, anotherMinter.address],
        true
      );
    await shrim.connect(minter).mint();
    await shrim.connect(buyer).mint();
    await shrim.connect(anotherMinter).mint();

    await expect(shrim.connect(minter).burn(1))
      .to.emit(shrim, "Transfer")
      .withArgs(minter.address, ethers.ZeroAddress, 1);
    expect(await shrim.hasMinted(minter.address)).to.equal(true);
    await expect(shrim.ownerOf(1)).to.be.reverted;

    await expect(shrim.connect(operator).burn(2)).to.be.reverted;
    await shrim.connect(buyer).setApprovalForAll(operator.address, true);
    await shrim
      .connect(anotherMinter)
      .setApprovalForAll(operator.address, true);
    await expect(shrim.connect(operator).burnBatch([2, 3]))
      .to.emit(shrim, "Transfer")
      .withArgs(buyer.address, ethers.ZeroAddress, 2)
      .and.to.emit(shrim, "Transfer")
      .withArgs(anotherMinter.address, ethers.ZeroAddress, 3);

    expect(await shrim.hasMinted(buyer.address)).to.equal(true);
    expect(await shrim.hasMinted(anotherMinter.address)).to.equal(true);
    expect(await shrim.nextTokenId()).to.equal(4);
    await expect(shrim.ownerOf(2)).to.be.reverted;
    await expect(shrim.ownerOf(3)).to.be.reverted;
  });

  it("reports and updates ERC-2981 royalties in any sale currency", async function () {
    const { shrim, owner, buyer } = await loadFixture(deployShrimpFixture);

    const etherSalePrice = ethers.parseEther("1");
    const erc20SalePrice = 100_000_000n;
    const [initialReceiver, etherRoyalty] = await shrim.royaltyInfo(
      1,
      etherSalePrice
    );
    const [, erc20Royalty] = await shrim.royaltyInfo(1, erc20SalePrice);

    expect(initialReceiver).to.equal(owner.address);
    expect(etherRoyalty).to.equal(ethers.parseEther("0.05"));
    expect(erc20Royalty).to.equal(5_000_000n);

    await expect(
      shrim.connect(buyer).setRoyalty(buyer.address, 100)
    ).to.be.revertedWithCustomError(shrim, "OwnableUnauthorizedAccount");
    await expect(shrim.connect(owner).setRoyalty(owner.address, 1_001))
      .to.be.revertedWithCustomError(shrim, "RoyaltyFeeTooHigh")
      .withArgs(1_001);

    await shrim.connect(owner).setRoyalty(buyer.address, 250);
    const [receiver, royalty] = await shrim.royaltyInfo(1, erc20SalePrice);
    expect(receiver).to.equal(buyer.address);
    expect(royalty).to.equal(2_500_000n);

    await shrim.connect(owner).clearRoyalty();
    const [clearedReceiver, clearedRoyalty] = await shrim.royaltyInfo(
      1,
      erc20SalePrice
    );
    expect(clearedReceiver).to.equal(ethers.ZeroAddress);
    expect(clearedRoyalty).to.equal(0);
  });

  it("maintains independent mint state for each collection", async function () {
    const { shrim, owner, minter } = await loadFixture(deployShrimpFixture);
    const mintStartTime = await time.latest();
    const Dolphin = await ethers.getContractFactory("OverlayerOriginDolphin");
    const dolphin = await Dolphin.deploy(
      dolphinDeploymentConfig(
        owner.address,
        ethers.ZeroAddress,
        0,
        owner.address,
        mintStartTime
      )
    );
    await dolphin.waitForDeployment();

    const Whale = await ethers.getContractFactory("OverlayerOriginWhale");
    const whale = await Whale.deploy(
      whaleDeploymentConfig(
        owner.address,
        ethers.ZeroAddress,
        0,
        owner.address,
        mintStartTime
      )
    );
    await whale.waitForDeployment();

    await shrim.connect(owner).setWhitelist(minter.address, true);
    await dolphin.connect(owner).setWhitelist(minter.address, true);
    await whale.connect(owner).setWhitelist(minter.address, true);
    await shrim.connect(minter).mint();
    await dolphin.connect(minter).mint({ value: DOLPHIN_INITIAL_PRICE });
    await whale.connect(minter).mint({ value: WHALE_INITIAL_PRICE });

    expect(await shrim.ownerOf(1)).to.equal(minter.address);
    expect(await dolphin.ownerOf(1)).to.equal(minter.address);
    expect(await whale.ownerOf(1)).to.equal(minter.address);
    expect(await shrim.name()).to.equal("Overlayer Origin Shrimp");
    expect(await dolphin.name()).to.equal("Overlayer Origin Dolphin");
    expect(await whale.name()).to.equal("Overlayer Origin Whale");
    expect(await shrim.symbol()).to.equal("Overlayer Origin Shrimp");
    expect(await dolphin.symbol()).to.equal("Overlayer Origin Dolphin");
    expect(await whale.symbol()).to.equal("Overlayer Origin Whale");
    expect(await dolphin.hasMinted(minter.address)).to.equal(true);
  });
});
