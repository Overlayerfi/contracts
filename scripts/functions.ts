
import { ethers } from "hardhat";
import { USDC_ADDRESS, USDT_ADDRESS } from "./addresses";
import STAKED_USDX_ABI from "../artifacts/contracts/token/StakedUSDxFront.sol/StakedUSDxFront.json";

export async function deployUSDx(
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

export async function deployStakedUSDx(
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

export async function deployStakingRewardsDistributor(
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

export async function deployLiquidity(
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