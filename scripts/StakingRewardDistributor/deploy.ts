import { ethers } from "hardhat";
import { USDC_ADDRESS, USDT_ADDRESS } from "../addresses";
import STAKED_USDX_ABI from "../../artifacts/contracts/token/StakedUSDxFront.sol/StakedUSDxFront.json";

export async function deploy(
	stakedUsdx: string, usdx: string, grantRewarderRole: boolean
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log(
    'Deploying StakingRewardsDistributor contract with address:',
    deployer.address
  );
	console.log("USDx:", usdx);
	console.log("StakedUSDx:", stakedUsdx);

  const ContractSource = await ethers.getContractFactory(
    'StakingRewardsDistributor'
  );
  const deployedContract = await ContractSource.deploy(
		stakedUsdx,
		usdx,
		USDC_ADDRESS,
		USDT_ADDRESS,
		deployer.address,
		deployer.address
  );
  await deployedContract.waitForDeployment();

  console.log('Contract deployed at:', await deployedContract.getAddress());

	if (grantRewarderRole) {
		const stakedUsdxContract = new ethers.Contract(stakedUsdx, STAKED_USDX_ABI.abi);
		await stakedUsdxContract.connect(deployer).grantRole(ethers.keccak256(ethers.toUtf8Bytes("REWARDER_ROLE")), await deployedContract.getAddress());
		console.log("Rewarder role attributed to:", await deployedContract.getAddress());
	}
}

deploy("0x9E7ef64F17E79366e70C1Fdc01E1A00323e1FCF8", "0x72872f101327902fC805637Cccd9A3542ed31e47", true).catch((err) => {
	console.error("Deployment failed ->", err);
})