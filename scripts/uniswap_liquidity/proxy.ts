import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  DAI_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS,
  WETH_MAINNET_ADDRESS
} from "../addresses";
import { DAI_ABI } from "../abi/DAI_abi";
import { swap } from "../uniswap_swapper/swap";

export async function mintPosition(
  token0: string,
  token1: string,
  decimals0: number,
  decimals1: number,
  amount0: string,
  amount1: string,
  fee: number,
  limitAmount?: string
) {
  const supported: string[] = [
    USDC_ADDRESS,
    USDT_ADDRESS,
    DAI_ADDRESS,
    WETH_MAINNET_ADDRESS
  ];
  if (!supported.includes(token0)) {
    throw Error("Invalid token0");
  }
  if (!supported.includes(token1)) {
    throw Error("Invalid token1");
  }

  const maxAmount = Math.min(
    Math.max(+amount0, +amount1),
    limitAmount !== undefined ? +limitAmount : 2 ^ 18
  );

  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying UniswapV3LiquidityProxy contract with signer:",
    deployer.address
  );

  const swapContract = await ethers.getContractFactory(
    "UniswapV3LiquidityProxy"
  );

  // define max fee for test network
  const block = await deployer.provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const maxFee = baseFee * BigInt(10);
  const defaultTransactionOptions = {
    maxFeePerGas: maxFee
  };

  // deploy the uni proxy contract
  const uni = await swapContract.deploy(defaultTransactionOptions);
  await uni.waitForDeployment();
  console.log("Contract deployed at:", await uni.getAddress());

  const token0Contract = new ethers.Contract(token0, DAI_ABI, deployer);
  const token1Contract = new ethers.Contract(token1, DAI_ABI, deployer);

  const wethToWrap = maxAmount * 3 + 0.5;
  await swap(wethToWrap.toFixed(2), maxAmount.toFixed(2));

  // approve the uni proxy contract
  console.log("Approving the uni proxy contract...");
  for (const t of [token0Contract, token1Contract]) {
    await (t.connect(deployer) as Contract).approve(
      await uni.getAddress(),
      ethers.MaxUint256
    );
  }
  console.log("Spender approved");

  // mint position
  const tx = await uni
    .connect(deployer)
    .mintNewPosition(
      token0,
      token1,
      ethers.parseUnits(amount0, decimals0),
      ethers.parseUnits(amount1, decimals1),
      fee,
      defaultTransactionOptions
    );

  // read emitted events and parse the required infos
  const result = await tx.wait();
  const logs = result?.logs;
  const lastLog = logs[logs.length - 1];
  const parsed = parseLog(lastLog);
  console.log(parsed);

  return parsed;
}

// amounts are in wei
function parseLog(log) {
  return {
    tokenId: log.args[0],
    liquidity: log.args[1],
    token0: log.args[2],
    token1: log.args[3],
    fee: log.args[4]
  };
}
