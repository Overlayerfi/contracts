import { ethers } from "hardhat";
import { Contract } from "ethers";
import { WETH_ABI } from "../abi/WETH_abi";
import { DAI_ADDRESS, USDC_ADDRESS, USDT_ADDRESS, WETH_MAINNET_ADDRESS } from "../addresses";
import { USDC_ABI } from "../abi/USDC_abi";
import { USDT_ABI } from "../abi/USDT_abi";
import { DAI_ABI } from "../abi/DAI_abi";

let SWAP_CODES = [1, 2];

// code 0: DAI
// code 1: USDC
// code 2: USDT
export async function swap(wethAmountToWrap: string, wethAmountToSwap: string, code?: number) {
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying UniswapV3SingleHopSwap contract with signer:",
    deployer.address
  );

  // define max fee for test network
  const block = await deployer.provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const maxFee = baseFee * BigInt(10);
  const defaultTransactionOptions = {
    maxFeePerGas: maxFee 
  };

  const swapContract = await ethers.getContractFactory(
    "UniswapV3SingleHopSwap"
  );
  const swapper = await swapContract.deploy(defaultTransactionOptions);
  await swapper.waitForDeployment();
  console.log("Contract deployed at:", await swapper.getAddress());

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
  console.log("Approving the swap contract...");
  await (weth.connect(deployer) as Contract).approve(
    await swapper.getAddress(),
    ethers.MaxUint256
  );
  console.log("Spender approved");

  SWAP_CODES = code === undefined ? SWAP_CODES : [code]; 
  for (let i = 0; i < SWAP_CODES.length; ++i) {
    await swapper
      .connect(deployer)
      .swapExactInputSingleHop(
        ethers.parseUnits(wethAmountToSwap, 18),
        1,
        SWAP_CODES[i],
        defaultTransactionOptions
      );
  }

  const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, deployer);
  const usdtContract = new ethers.Contract(USDT_ADDRESS, USDT_ABI, deployer);
  const daiContract = new ethers.Contract(DAI_ADDRESS, DAI_ABI, deployer);
  for (const t of [{"contract": usdcContract, "name": "usdc", "decimals": 6}, {"contract": usdtContract, "name": "usdt", "decimals": 6}, {"contract": daiContract, "name": "dai", "decimals": 18}]) {
    console.log(
      deployer.address,
      `${t.name} balance`,
      ethers.formatUnits(await t.contract.balanceOf(deployer.address), t.decimals)
    );
  }
}
