import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { config, ethers, network } from "hardhat";
import { expect } from "chai";
import {
  AAVE_POOL_V3_ADDRESS,
  AUSDT_ADDRESS,
  USDT_ADDRESS
} from "../scripts/addresses";
import ERC20_ABI from "./ERC20_ABI.json";
import { swap } from "../scripts/uniswap_swapper/proxy";
import { runMainnetOftProductPostConfigure } from "../scripts/utils/postConfigureMainnetOftFromOmnichainDeployments";
import {
  assertPostConfigureProduct,
  deployWrapAndStaking
} from "./helpers/postConfigureMainnetOft";

/**
 * Generic Aave-backed post-config (USDT stands in for USDC/USDG: same backingKind).
 * Uses a mainnet fork so the real Aave pool and aToken exist.
 *
 * Run: npx hardhat test test/postConfigureMainnetOft.test.ts --network hardhat
 */
describe("runMainnetOftProductPostConfigure (Aave collateral)", function () {
  this.timeout(120000);

  async function deployAaveOftFixture() {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: config.networks.hardhat.forking?.url,
            blockNumber: config.networks.hardhat.forking?.blockNumber
          }
        }
      ]
    });
    await swap("25", "15", 2);

    const [admin, team, safety, buyBack] = await ethers.getSigners();
    const block = await admin.provider.getBlock("latest");
    const baseFee = block?.baseFeePerGas ?? 1n;
    const txOpts = { maxFeePerGas: baseFee * BigInt(10) };

    const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, ethers.provider);
    const ausdt = new ethers.Contract(AUSDT_ADDRESS, ERC20_ABI, ethers.provider);
    const collateralDecimals = Number(await usdt.decimals());
    const aCollateralDecimals = Number(await ausdt.decimals());

    const { overlayerWrap, sOverlayerWrap } = await deployWrapAndStaking({
      admin,
      collateralAddr: USDT_ADDRESS,
      aCollateralAddr: AUSDT_ADDRESS,
      collateralDecimals,
      aCollateralDecimals,
      name: "O-USDT",
      symbol: "O+USDT",
      wrapContract: "OverlayerWrap",
      txOpts
    });

    return {
      admin,
      team,
      safety,
      buyBack,
      usdt,
      overlayerWrap,
      sOverlayerWrap,
      collateralDecimals
    };
  }

  it("wires staking backing, accepts the spender, grants rewarder, and seeds stake", async function () {
    const {
      admin,
      team,
      safety,
      buyBack,
      usdt,
      overlayerWrap,
      sOverlayerWrap,
      collateralDecimals
    } = await loadFixture(deployAaveOftFixture);

    expect(await sOverlayerWrap.overlayerWrapBacking()).to.equal(
      ethers.ZeroAddress
    );
    expect(await overlayerWrap.getSpender()).to.equal(ethers.ZeroAddress);
    expect(await sOverlayerWrap.totalAssets()).to.equal(0n);

    const result = await runMainnetOftProductPostConfigure(
      {
        productLabel: "OverlayerTether",
        oftOverlayerWrapAddr: await overlayerWrap.getAddress(),
        stakedOverlayerWrapAddr: await sOverlayerWrap.getAddress(),
        collateralAddress: USDT_ADDRESS,
        aCollateralAddress: AUSDT_ADDRESS,
        decimals: collateralDecimals,
        backingKind: "aave"
      },
      {
        signerAddr: admin.address,
        team: team.address,
        safetyModule: safety.address,
        buyBack: buyBack.address
      }
    );

    const backing = await assertPostConfigureProduct({
      result,
      admin,
      overlayerWrap,
      sOverlayerWrap,
      collateral: usdt,
      aCollateralAddr: AUSDT_ADDRESS,
      backingName: "OverlayerWrapBacking",
      collateralDecimals
    });

    expect(await backing.aave()).to.equal(AAVE_POOL_V3_ADDRESS);
  });
});
