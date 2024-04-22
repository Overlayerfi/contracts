import { ethers } from "hardhat";

export async function deploy(
  devAddress: string,
  startingBlock: number
): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log(
    'Deploying Liquidity contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory('Liquidity');
  const deployedContract = await ContractSource.deploy(
    devAddress,
    startingBlock
  );

  await deployedContract.waitForDeployment();

  console.log('Contract deployed at:', await deployedContract.getAddress());
}

deploy('', 0).catch((error) => {
  console.error("Deployment failed ->", error);
});
