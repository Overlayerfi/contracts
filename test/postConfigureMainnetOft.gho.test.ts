import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { runMainnetOftProductPostConfigure } from "../scripts/utils/postConfigureMainnetOftFromOmnichainDeployments";
import {
  assertPostConfigureProduct,
  deployWrapAndStaking
} from "./helpers/postConfigureMainnetOft";

/**
 * GHO post-config: OverlayerWrapGhoBacking uses sGHO. The OFT aCollateral slot is a
 * zero-supply token, so the audited wrap rejects sGHO mint and redeem.
 *
 * Run: npx hardhat test test/postConfigureMainnetOft.gho.test.ts --network hardhat
 */
describe("runMainnetOftProductPostConfigure (GHO)", function () {
  async function deployGhoOftFixture() {
    const [admin, team, safety, buyBack] = await ethers.getSigners();
    const block = await admin.provider.getBlock("latest");
    const baseFee = block?.baseFeePerGas ?? 1n;
    const txOpts = { maxFeePerGas: baseFee * BigInt(10) };

    const gho = await (
      await ethers.getContractFactory("MintableERC20")
    ).deploy(10_000_000, "GHO", "GHO", txOpts);
    await gho.waitForDeployment();

    const vault = await (
      await ethers.getContractFactory("MockSghoVault")
    ).deploy(await gho.getAddress(), txOpts);
    await vault.waitForDeployment();

    const excluded = await (
      await ethers.getContractFactory("GhoExcludedCollateral")
    ).deploy(txOpts);
    await excluded.waitForDeployment();

    const { overlayerWrap, sOverlayerWrap } = await deployWrapAndStaking({
      admin,
      collateralAddr: await gho.getAddress(),
      aCollateralAddr: await excluded.getAddress(),
      collateralDecimals: Number(await gho.decimals()),
      aCollateralDecimals: 18,
      name: "O-GHO",
      symbol: "O+GHO",
      wrapContract: "OverlayerWrapMock",
      txOpts
    });

    return {
      admin,
      team,
      safety,
      buyBack,
      gho,
      vault,
      overlayerWrap,
      sOverlayerWrap
    };
  }

  it("wires staking backing, accepts the spender, grants rewarder, and seeds stake", async function () {
    const {
      admin,
      team,
      safety,
      buyBack,
      gho,
      vault,
      overlayerWrap,
      sOverlayerWrap
    } = await loadFixture(deployGhoOftFixture);

    expect(await sOverlayerWrap.overlayerWrapBacking()).to.equal(
      ethers.ZeroAddress
    );
    expect(await overlayerWrap.getSpender()).to.equal(ethers.ZeroAddress);
    expect(await sOverlayerWrap.totalAssets()).to.equal(0n);

    const result = await runMainnetOftProductPostConfigure(
      {
        productLabel: "OverlayerGHO",
        oftOverlayerWrapAddr: await overlayerWrap.getAddress(),
        stakedOverlayerWrapAddr: await sOverlayerWrap.getAddress(),
        collateralAddress: await gho.getAddress(),
        aCollateralAddress: await vault.getAddress(),
        decimals: 18,
        backingKind: "gho"
      },
      {
        signerAddr: admin.address,
        team: team.address,
        safetyModule: safety.address,
        buyBack: buyBack.address
      }
    );

    await assertPostConfigureProduct({
      result,
      admin,
      overlayerWrap,
      sOverlayerWrap,
      collateral: gho,
      aCollateralAddr: await vault.getAddress(),
      backingName: "OverlayerWrapGhoBacking",
      collateralDecimals: 18
    });
  });
});
