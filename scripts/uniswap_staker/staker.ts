import { ethers } from "hardhat";

export async function deployV3Staker(
  factory: string,
  nftpos: string,
  maxIncentiveStartLeadTime: number,
  maxIncentiveDuration: number
): Promise<string> {
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying UniswapV3Staker contract with signer:",
    deployer.address
  );

  const stakerContract = await ethers.getContractFactory("UniswapV3Staker");

  // define max fee for test network
  const block = await deployer.provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const maxFee = baseFee * BigInt(10);
  const defaultTransactionOptions = {
    maxFeePerGas: maxFee
  };

  // deploy the uni proxy contract
  const uni = await stakerContract.deploy(
    factory,
    nftpos,
    maxIncentiveStartLeadTime,
    maxIncentiveDuration,
    defaultTransactionOptions
  );
  await uni.waitForDeployment();

  console.log("V3 staker contract deployed at:", await uni.getAddress());

  return await uni.getAddress();
}
