import {
  CURVE_STABLE_SWAP_FACTORY,
  CURVE_STABLE_SWAP_FACTORY_SEPOLIA
} from "../addresses";
import { ethers } from "hardhat";

async function main(sepolia: boolean) {
  const [admin] = await ethers.getSigners();
  const block = await admin.provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const defaultTransactionOptions = {
    maxFeePerGas: baseFee * BigInt(2)
  };

  const Contract = await ethers.getContractFactory("CurvePoolDeployer");
  const contract = await Contract.deploy(
    sepolia ? CURVE_STABLE_SWAP_FACTORY_SEPOLIA : CURVE_STABLE_SWAP_FACTORY,
    defaultTransactionOptions
  );
  await contract.waitForDeployment();

  console.log(`Contract deployed at: ${await contract.getAddress()}`);
}

main(false).catch((e) => console.log(e));
