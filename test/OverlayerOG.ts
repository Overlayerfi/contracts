import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Overlayer OG", function () {
  const BASE_URI = "ipfs://overlayer-og/";
  const INITIAL_ROYALTY_BPS = 500;
  const MINT_START_TIME = 0;
  const MAX_SUPPLY = 2_000;
  const BONUS_DENOMINATOR = 100;

  async function deployOgFixture() {
    const [owner, minter, buyer] = await ethers.getSigners();
    const OverlayerOG = await ethers.getContractFactory("OverlayerOG");
    const og = await OverlayerOG.deploy(
      owner.address,
      BASE_URI,
      owner.address,
      INITIAL_ROYALTY_BPS,
      MINT_START_TIME
    );
    await og.waitForDeployment();

    return { og, owner, minter, buyer };
  }

  it("is free to mint for allowlisted users", async function () {
    const { og, owner, minter, buyer } = await loadFixture(deployOgFixture);

    expect(await og.name()).to.equal("Overlayer OG");
    expect(await og.symbol()).to.equal("Overlayer OG");
    expect(await og.feeCollector()).to.equal(ethers.ZeroAddress);
    expect(await og.mintPrice()).to.equal(0);
    expect(await og.maxSupply()).to.equal(MAX_SUPPLY);
    expect(await og.bonusNumerator()).to.equal(0);
    expect(await og.bonusDenominator()).to.equal(BONUS_DENOMINATOR);
    expect(await og.mintStartTime()).to.equal(MINT_START_TIME);
    expect(await og.mintEndTime()).to.equal(0);
    expect(await og.publicMintStartTime()).to.equal(0);

    await expect(og.connect(buyer).mint()).to.be.revertedWithCustomError(
      og,
      "NotWhitelisted"
    );

    await og.connect(owner).setWhitelist(minter.address, true);
    await expect(og.connect(minter).mint())
      .to.emit(og, "Minted")
      .withArgs(minter.address, 1);

    expect(await og.ownerOf(1)).to.equal(minter.address);
    expect(await og.tokenURI(1)).to.equal(`${BASE_URI}1`);
    expect(await og.hasMinted(minter.address)).to.equal(true);
  });

  it("allows approvals but prevents every token transfer", async function () {
    const { og, owner, minter, buyer } = await loadFixture(deployOgFixture);

    await og.connect(owner).setWhitelist(minter.address, true);
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

  it("allows an approved operator to burn a non-transferable OG NFT", async function () {
    const { og, owner, minter, buyer } = await loadFixture(deployOgFixture);

    await og.connect(owner).setWhitelist(minter.address, true);
    await og.connect(minter).mint();
    await og.connect(minter).approve(buyer.address, 1);

    await expect(og.connect(buyer).burn(1))
      .to.emit(og, "Transfer")
      .withArgs(minter.address, ethers.ZeroAddress, 1);

    expect(await og.hasMinted(minter.address)).to.equal(true);
    await expect(og.ownerOf(1)).to.be.reverted;
  });
});
