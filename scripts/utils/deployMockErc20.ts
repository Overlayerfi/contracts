import { ethers } from "hardhat";

async function main(count: number) {
  const [admin] = await ethers.getSigners();
  const block = await admin.provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const defaultTransactionOptions = {
    maxFeePerGas: baseFee * BigInt(10)
  };

  console.log("Deployed address:", await admin.getAddress());

  for (let i = 0; i < count; i++) {
    const TokenA = await ethers.getContractFactory("FixedSupplyERC20");
    const tokenA = await TokenA.deploy(
      1000,
      "token" + i.toString,
      "token" + i.toString,
      defaultTransactionOptions
    );

    console.log("Token deployed at", await tokenA.getAddress());
  }
}

main(2)
  .then(() => {})
  .catch((e) => console.error(e));
