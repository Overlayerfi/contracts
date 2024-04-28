import { ethers } from "hardhat";
import { WETH_ABI } from "./WETH_abi";
import { USDC_ADDRESS, USDT_ADDRESS } from "../addresses";
import { USDC_ABI } from "./USDC_abi";
import { USDT_ABI } from "./USDT_abi";

const WETH_MAINNET_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const WETH_AMOUNT_TO_WRAP = "1";
const WETH_TO_SWAP = "0.5";
const SWAP_CODES = [1, 2];

async function deploy() {
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying UniswapV3SingleHopSwap contract with signer:",
    deployer.address
  );

  const swapContract = await ethers.getContractFactory(
    "UniswapV3SingleHopSwap"
  );
  const swapper = await swapContract.deploy();
  await swapper.waitForDeployment();
  console.log("Contract deployed at:", await swapper.getAddress());

  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545/");
  const weth = new ethers.Contract(WETH_MAINNET_ADDRESS, WETH_ABI, provider);
  await weth
    .connect(deployer)
    .deposit({ value: ethers.parseEther(WETH_AMOUNT_TO_WRAP) });
  console.log(
    deployer.address,
    "WETH balance:",
    ethers.formatEther(await weth.balanceOf(deployer.address))
  );
  console.log("Approving the swap contract...");
  await weth
    .connect(deployer)
    .approve(await swapper.getAddress(), ethers.MaxUint256);
  console.log("Spender approved");

  for (let i = 0; i < SWAP_CODES.length; ++i) {
    await swapper
      .connect(deployer)
      .swapExactInputSingleHop(
        ethers.parseUnits(WETH_TO_SWAP, 18),
        1,
        SWAP_CODES[i]
      );
  }

  const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, deployer);
  const usdtContract = new ethers.Contract(USDT_ADDRESS, USDT_ABI, deployer);
  console.log(
    deployer.address,
    "USDC balance",
    ethers.formatUnits(await usdcContract.balanceOf(deployer.address), 6)
  );
  console.log(
    deployer.address,
    "USDT balance",
    ethers.formatUnits(await usdtContract.balanceOf(deployer.address), 6)
  );
}

deploy().catch((err) => {
  console.error("Swap failed:", err);
});
