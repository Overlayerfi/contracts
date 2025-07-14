import { CURVE_STABLE_SWAP_FACTORY } from "../addresses";
import { ethers } from "hardhat";

async function main() {
  const [admin] = await ethers.getSigners();
  const block = await admin.provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const defaultTransactionOptions = {
    maxFeePerGas: baseFee * BigInt(10)
  };

  const Contract = await ethers.getContractFactory("CurvePoolDeployer");
  const contract = await Contract.deploy(
    CURVE_STABLE_SWAP_FACTORY,
    defaultTransactionOptions
  );
  await contract.waitForDeployment();

  console.log(`Contract deployed at: ${await contract.getAddress()}`);
}

main().catch((e) => console.log(e));
