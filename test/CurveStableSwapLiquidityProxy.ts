import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  CURVE_DAI_USDC_USDT_LP,
  CURVE_DAI_USDC_USDT_POOL,
  DAI_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS
} from "../scripts/addresses";
import { swap } from "../scripts/uniswap_swapper/proxy";
import { addLiquidityTriStable } from "../scripts/curve/addLiqTriStable";
import { DAI_ABI } from "../scripts/abi/DAI_abi";
import { USDC_ABI } from "../scripts/abi/USDC_abi";
import { USDT_ABI } from "../scripts/abi/USDT_abi";

describe("CurveStableSwapLiquidityProxy", function () {
  async function deployFixture() {
    const [deployer, bob, alice] = await ethers.getSigners();

    const token0 = DAI_ADDRESS;
    const token1 = USDC_ADDRESS;
    const token2 = USDT_ADDRESS;
    const token0Decimals = 18;
    const token1Decimals = 6;
    const token2Decimals = 6;

    const curveContract = await ethers.getContractFactory(
      "CurveLiquidityProxy"
    );

    // define max fee for test network
    const block = await deployer.provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const maxFee = baseFee * BigInt(10);
    const defaultTransactionOptions = {
      maxFeePerGas: maxFee
    };

    // deploy the uni proxy contract
    const curve = await curveContract.deploy(defaultTransactionOptions);

    await curve.waitForDeployment();

    const token0Abi = DAI_ABI;
    const token1Abi = USDC_ABI;
    const token2Abi = USDT_ABI;

    return {
      curve,
      token0,
      token1,
      token2,
      token0Decimals,
      token1Decimals,
      token2Decimals,
      deployer,
      bob,
      alice,
      token0Abi,
      token1Abi,
      token2Abi
    };
  }

  describe("Liquidity Operations", function () {
    it("Should successfully add liquidity to Curve stable pool", async function () {
      const {
        curve,
        token0,
        token1,
        token2,
        token0Decimals,
        token1Decimals,
        token2Decimals,
        token0Abi,
        token1Abi,
        token2Abi,
        deployer
      } = await loadFixture(deployFixture);

      // Swap some DAI and USDC
      await swap("0.5", "0.1");

      const amount = "10";

      // Transfer funds to curve contract
      const token1Contract = new ethers.Contract(token1, token1Abi);
      const token0Contract = new ethers.Contract(token0, token0Abi);
      const token2Contract = new ethers.Contract(token2, token2Abi);
      await token0Contract
        .connect(deployer)
        .transfer(
          await curve.getAddress(),
          ethers.parseUnits(amount, token0Decimals)
        );
      await token1Contract
        .connect(deployer)
        .transfer(
          await curve.getAddress(),
          ethers.parseUnits(amount, token1Decimals)
        );
      await token2Contract
        .connect(deployer)
        .transfer(
          await curve.getAddress(),
          ethers.parseUnits(amount, token2Decimals)
        );

      await addLiquidityTriStable(
        curve,
        CURVE_DAI_USDC_USDT_POOL,
        CURVE_DAI_USDC_USDT_LP,
        token0,
        token1,
        token2,
        token0Decimals,
        token1Decimals,
        token2Decimals,
        amount,
        amount,
        amount
      );

      const lpContract = new ethers.Contract(
        CURVE_DAI_USDC_USDT_LP,
        USDC_ABI,
        deployer
      ); // Any other ERC20 abi is ok

      expect(await lpContract.balanceOf(deployer.address)).to.be.greaterThan(0);

      console.log(
        "LP balance:",
        ethers.formatEther(await lpContract.balanceOf(deployer.address))
      ); // LP has 18 decimals
    });
  });
});
