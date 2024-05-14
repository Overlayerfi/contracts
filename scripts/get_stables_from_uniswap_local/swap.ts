import { ethers } from "hardhat";
import { Contract } from "ethers";
import { WETH_ABI } from "./WETH_abi";
import { USDC_ADDRESS, USDT_ADDRESS, WETH_MAINNET_ADDRESS } from "../addresses";
import { USDC_ABI } from "./USDC_abi";
import { USDT_ABI } from "./USDT_abi";

const SWAP_CODES = [1, 2];

export async function swap(wethAmountToWrap: string, wethAmountToSwap: string) {
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying UniswapV3SingleHopSwap contract with signer:",
    deployer.address
  );

  const swapContract = await ethers.getContractFactory(
    "UniswapV3SingleHopSwap"
  );
  const swapper = await swapContract.deploy({ maxFeePerGas: 9702346660 });
  await swapper.waitForDeployment();
  console.log("Contract deployed at:", await swapper.getAddress());

  const weth = new ethers.Contract(WETH_MAINNET_ADDRESS, WETH_ABI, deployer);
  await (weth.connect(deployer) as Contract).deposit({
    value: ethers.parseEther(wethAmountToWrap),
    maxFeePerGas: 9702346660
  });
  console.log(
    deployer.address,
    "WETH balance:",
    ethers.formatEther(await weth.balanceOf(deployer.address))
  );
  console.log("Approving the swap contract...");
  await (weth.connect(deployer) as Contract).approve(
    await swapper.getAddress(),
    ethers.MaxUint256
  );
  console.log("Spender approved");

  for (let i = 0; i < SWAP_CODES.length; ++i) {
    await swapper
      .connect(deployer)
      .swapExactInputSingleHop(
        ethers.parseUnits(wethAmountToSwap, 18),
        1,
        SWAP_CODES[i],
        { maxFeePerGas: 9702346660 }
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
