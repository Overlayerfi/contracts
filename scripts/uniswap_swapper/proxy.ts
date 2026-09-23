import { ethers } from "hardhat";
import { Contract } from "ethers";
import { WETH_ABI } from "../abi/WETH_abi";
import {
  DAI_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS,
  WETH_MAINNET_ADDRESS
} from "../addresses";
import { USDC_ABI } from "../abi/USDC_abi";
import { USDT_ABI } from "../abi/USDT_abi";
import { DAI_ABI } from "../abi/DAI_abi";

const SWAP_ROUTER_02 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
const POOL_FEE = 3000;
const ALL_SWAP_CODES = [0, 1, 2];
const EXACT_INPUT_SINGLE_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)"
];

// code 0: DAI
// code 1: USDC
// code 2: USDT
export async function swap(
  wethAmountToWrap: string,
  wethAmountToSwap: string,
  code?: number
) {
  const [deployer] = await ethers.getSigners();
  console.log("Swapping on SwapRouter02 with signer:", deployer.address);

  const block = await deployer.provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const maxFee = baseFee * BigInt(10);
  const txOptions = {
    maxFeePerGas: maxFee
  };

  const weth = new ethers.Contract(WETH_MAINNET_ADDRESS, WETH_ABI, deployer);
  await (weth.connect(deployer) as Contract).deposit({
    value: ethers.parseEther(wethAmountToWrap),
    maxFeePerGas: maxFee
  });
  console.log(
    deployer.address,
    "WETH balance:",
    ethers.formatEther(await weth.balanceOf(deployer.address))
  );

  const router = new ethers.Contract(
    SWAP_ROUTER_02,
    EXACT_INPUT_SINGLE_ABI,
    deployer
  );
  await (weth.connect(deployer) as Contract).approve(
    SWAP_ROUTER_02,
    ethers.MaxUint256
  );
  console.log("SwapRouter02 approved");

  const amountIn = ethers.parseUnits(wethAmountToSwap, 18);
  const swapCodes = code === undefined ? ALL_SWAP_CODES : [code];
  for (const swapCode of swapCodes) {
    const tokenOut =
      swapCode === 1
        ? USDC_ADDRESS
        : swapCode === 2
        ? USDT_ADDRESS
        : DAI_ADDRESS;
    await (router.connect(deployer) as Contract).exactInputSingle(
      {
        tokenIn: WETH_MAINNET_ADDRESS,
        tokenOut,
        fee: POOL_FEE,
        recipient: deployer.address,
        amountIn,
        amountOutMinimum: 1,
        sqrtPriceLimitX96: 0
      },
      txOptions
    );
  }

  const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, deployer);
  const usdtContract = new ethers.Contract(USDT_ADDRESS, USDT_ABI, deployer);
  const daiContract = new ethers.Contract(DAI_ADDRESS, DAI_ABI, deployer);
  for (const t of [
    { contract: usdcContract, name: "usdc", decimals: 6 },
    { contract: usdtContract, name: "usdt", decimals: 6 },
    { contract: daiContract, name: "dai", decimals: 18 }
  ]) {
    console.log(
      deployer.address,
      `${t.name} balance`,
      ethers.formatUnits(
        await t.contract.balanceOf(deployer.address),
        t.decimals
      )
    );
  }
}
