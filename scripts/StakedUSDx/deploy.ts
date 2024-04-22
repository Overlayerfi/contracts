import { ethers } from "hardhat";

export async function deploy(
	usdx: string
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log(
    'Deploying StakedUSDx contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory(
    'StakedUSDx'
  );
  const deployedContract = await ContractSource.deploy(
		usdx,
		deployer.address,
		deployer.address,
		0
  );
  await deployedContract.waitForDeployment();

  console.log('Contract deployed at:', await deployedContract.getAddress());
}

deploy("0x72872f101327902fC805637Cccd9A3542ed31e47").catch((err) => {
	console.error("Deployment failed -> " + err);
})