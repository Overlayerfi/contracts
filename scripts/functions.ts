import { ethers } from "hardhat";
import { Contract } from "ethers";
import { USDC_ADDRESS, USDT_ADDRESS } from "./addresses";
import STAKED_USDX_ABI from "../artifacts/contracts/token/StakedUSDOFront.sol/StakedUSDOFront.json";
import LIQUIDITY_ABI from "../artifacts/contracts/liquidity/Liquidity.sol/Liquidity.json";
import { ILiquidity } from "./types";

export async function deployUSDO(): Promise<string> {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying USDOM contract with signer:", deployer.address);

  const ContractSource = await ethers.getContractFactory("USDOM");
  const deployedContract = await ContractSource.deploy(
    deployer.address,
    {
      addr: USDC_ADDRESS,
      decimals: 6
    },
    {
      addr: USDT_ADDRESS,
      decimals: 6
    },
    ethers.parseEther("100000000"),
    ethers.parseEther("100000000"),
    {
      maxFeePerGas: 6702346660 * 10
    }
  );
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
  return await deployedContract.getAddress();
}

export async function deployStakedUSDO(usdo: string): Promise<string> {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying StakedUSDO contract with signer:", deployer.address);

  const ContractSource = await ethers.getContractFactory("StakedUSDOFront");
  const deployedContract = await ContractSource.deploy(
    usdo,
    deployer.address,
    deployer.address,
    0,
    {
      maxFeePerGas: 6702346660 * 10
    }
  );
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
  return await deployedContract.getAddress();
}

export async function deployAirdropOBSIReceipt(usdo: string): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Deploying AirdropOBSIReceipt contract with signer:",
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory("AirdropOBSIReceipt");
  const deployedContract = await ContractSource.deploy(usdo, deployer.address, {
    maxFeePerGas: 6702346660 * 10
  });
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
}

export async function deployLiquidityAirdropReward(
  admin: string
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  if (!ethers.isAddress(admin)) {
    throw new Error("admin is not an address");
  }

  console.log(
    "Deploying LiquidityAirdropReward contract with signer:",
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory(
    "LiquidityAirdropReward"
  );
  const deployedContract = await ContractSource.deploy(admin, {
    maxFeePerGas: 6702346660 * 10
  });
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
  return await deployedContract.getAddress();
}

export async function setCooldownStaking(
  addr: string,
  seconds: number
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log("Setting cooldown to staking with account:", deployer.address);

  const contract = new ethers.Contract(addr, STAKED_USDX_ABI.abi, deployer);
  await (contract.connect(deployer) as Contract).setCooldownDuration(seconds);

  console.log("Operation passed");
}

export async function deployStakingRewardsDistributor(
  stakedUsdx: string,
  usdo: string,
  grantRewarderRole: boolean
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Deploying StakingRewardsDistributor contract with signer:",
    deployer.address
  );
  console.log("USDO:", usdo);
  console.log("StakedUSDO:", stakedUsdx);

  const ContractSource = await ethers.getContractFactory(
    "StakingRewardsDistributor"
  );
  const deployedContract = await ContractSource.deploy(
    stakedUsdx,
    usdo,
    USDC_ADDRESS,
    USDT_ADDRESS,
    deployer.address,
    deployer.address,
    {
      maxFeePerGas: 6702346660 * 10
    }
  );
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());

  if (grantRewarderRole) {
    const stakedUsdxContract = new ethers.Contract(
      stakedUsdx,
      STAKED_USDX_ABI.abi
    );
    await (stakedUsdxContract.connect(deployer) as Contract).grantRole(
      ethers.keccak256(ethers.toUtf8Bytes("REWARDER_ROLE")),
      await deployedContract.getAddress()
    );
    console.log(
      "Rewarder role attributed to:",
      await deployedContract.getAddress()
    );
  }
}

export async function deployLiquidity(
  admin: string,
  startingBlock: number
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  if (!ethers.isAddress(admin)) {
    throw new Error("admin is not ad address");
  }

  console.log("Deploying Liquidity contract with signer:", deployer.address);

  const ContractSource = await ethers.getContractFactory("Liquidity");
  const deployedContract = await ContractSource.deploy(admin, startingBlock);

  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
  return await deployedContract.getAddress();
}

export async function deployGovernanceToken(admin: string): Promise<string> {
  const [deployer] = await ethers.getSigners();

  if (!ethers.isAddress(admin)) {
    throw new Error("admin is not ad address");
  }

  console.log("Deploying OBSI contract with signer:", deployer.address);

  const ContractSource = await ethers.getContractFactory("OBSI");
  const deployedContract = await ContractSource.deploy(admin);

  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
  return await deployedContract.getAddress();
}

export async function addRewardLiquidity(
  addr: string,
  rewards: { addr: string; rewardPerBlockEther: bigint }[]
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  if (!ethers.isAddress(addr)) {
    throw new Error("addr is not ad address");
  }
  for (const r of rewards) {
    if (!ethers.isAddress(r.addr)) {
      throw new Error("reward is not ad address: " + r);
    }
  }

  console.log(
    "Adding rewards to Liquidity contract with signer:",
    deployer.address
  );

  const contract = new ethers.Contract(addr, LIQUIDITY_ABI.abi, deployer);
  for (const r of rewards) {
    await (contract.connect(deployer) as Contract).setReward(
      r.addr,
      r.rewardPerBlockEther
    );
  }

  console.log("Rewards added");
}

export async function addPoolLiquidity(
  addr: string,
  pools: ILiquidity[],
  update: boolean
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  if (!ethers.isAddress(addr)) {
    throw new Error("addr is not ad address");
  }
  for (const p of pools) {
    if (!ethers.isAddress(p.info.stakedAsset)) {
      throw new Error("staked asset is not ad address: " + p.info.stakedAsset);
    }
    if (!ethers.isAddress(p.info.reward.address)) {
      throw new Error(
        "rewards asset is not ad address: " + p.info.reward.address
      );
    }
    if (isNaN(+p.info.weight)) {
      throw new Error("weight is not number: " + p.info.weight);
    }
  }

  console.log(
    "Adding pools to Liquidity contract with signer:",
    deployer.address
  );

  const contract = new ethers.Contract(addr, LIQUIDITY_ABI.abi, deployer);
  for (const p of pools) {
    await (contract.connect(deployer) as Contract).add(
      p.info.stakedAsset,
      p.info.reward.address,
      +p.info.weight,
      update
    );
  }

  console.log("Pools added");
}
