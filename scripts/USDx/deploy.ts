import { ethers } from "hardhat";
import { USDC_ADDRESS, USDT_ADDRESS } from "../addresses";

export async function deploy(
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log(
    'Deploying USDxM contract with address:',
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory(
    'USDxM'
  );
  const deployedContract = await ContractSource.deploy(
		await deployer.getAddress(),
		{
			addr: USDC_ADDRESS,
			decimals: 6
		},
		{
			addr: USDT_ADDRESS,
			decimals: 6
		},
		await deployer.getAddress(),
		ethers.parseEther('100000000'),
		ethers.parseEther('100000000')
  );
  await deployedContract.waitForDeployment();

  console.log('Contract deployed at:', await deployedContract.getAddress());
}

deploy().catch((err) => {
	console.error("Deployment failed -> " + err);
})