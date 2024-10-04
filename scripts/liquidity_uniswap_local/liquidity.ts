import { ethers } from "hardhat";
import { Contract } from "ethers";
import { WETH_ABI } from "../abi/WETH_abi";
import { DAI_ADDRESS, WETH_MAINNET_ADDRESS } from "../addresses";
import { DAI_ABI } from "../abi/DAI_abi";
import { swap } from "../get_stables_from_uniswap_local/swap";

// token0: DAI
// token1: WETH
export async function mintPosition(amountDai: string, amountWeth: string) {
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying UniswapV3Liquidity contract with signer:",
    deployer.address
  );

  const swapContract = await ethers.getContractFactory("UniswapV3Liquidity");

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

  const weth = new ethers.Contract(WETH_MAINNET_ADDRESS, WETH_ABI, deployer);
  const dai = new ethers.Contract(DAI_ADDRESS, DAI_ABI, deployer);

  // swap for DAI
  // as this is exact input swap we can't control the out DAI amount. Just swap enough...
  const wethToWrap = 20 + (+amountWeth + 0.1);
  await swap(wethToWrap.toFixed(2), "10", 0);

  // approve the uni proxy contract
  console.log("Approving the uni proxy contract...");
  for (const t of [weth, dai]) {
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
      ethers.parseUnits(amountDai, 18),
      ethers.parseEther(amountWeth),
      defaultTransactionOptions
    );

  // read emitted events and parse the required infos
  const result = await tx.wait();
  const logs = result?.logs;
  const lastLog = logs[logs.length - 1];
  console.log(parseLog(lastLog));
}

// amounts are in wei
function parseLog(log) {
  return {
    tokenId: log.args[0],
    liquidity: log.args[1],
    token0: log.args[2],
    token1: log.args[3]
  };
}
