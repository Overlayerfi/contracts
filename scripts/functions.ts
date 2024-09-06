import { ethers } from "hardhat";
import { Contract } from "ethers";
import { USDC_ADDRESS, USDT_ADDRESS } from "./addresses";
import STAKED_USDX_ABI from "../artifacts/contracts/token/StakedUSDOFront.sol/StakedUSDOFront.json";
import LIQUIDITY_ABI from "../artifacts/contracts/liquidity/Liquidity.sol/Liquidity.json";
import USDO_ABI from "../artifacts/contracts/token/USDOM.sol/USDOM.json";
import SUSDO_ABI from "../artifacts/contracts/token/StakedUSDOFront.sol/StakedUSDOFront.json";
import { ILiquidity } from "./types";
import { USDC_ABI } from "./get_stables_from_uniswap_local/USDC_abi";
import { USDT_ABI } from "./get_stables_from_uniswap_local/USDT_abi";

export async function deploy_USDO(
  approveDeployerCollateral?: boolean
): Promise<string> {
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
    ethers.parseEther("100000000")
    //{
    //  maxFeePerGas: 6702346660 * 10
    //}
  );
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());

  if (approveDeployerCollateral) {
    const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, deployer);
    const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, deployer);
    await (usdc.connect(deployer) as Contract).approve(
      await deployedContract.getAddress(),
      ethers.MaxUint256
    );
    await (usdt.connect(deployer) as Contract).approve(
      await deployedContract.getAddress(),
      ethers.MaxUint256
    );
  }

  return await deployedContract.getAddress();
}

export async function deploy_StakedUSDO(usdo: string): Promise<string> {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying StakedUSDO contract with signer:", deployer.address);

  const ContractSource = await ethers.getContractFactory("StakedUSDOFront");
  const deployedContract = await ContractSource.deploy(
    usdo,
    deployer.address,
    deployer.address,
    0
    //{
    //  maxFeePerGas: 6702346660 * 10
    //}
  );
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
  return await deployedContract.getAddress();
}

export async function deploy_AirdropOVAReceipt(usdo: string): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Deploying AirdropOVAReceipt contract with signer:",
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory("AirdropOVAReceipt");
  const deployedContract = await ContractSource.deploy(usdo, deployer.address, {
    maxFeePerGas: 6702346660 * 10
  });
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
}

export async function deploy_LiquidityAirdropReward(
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

export async function StakedUSDO_setCooldownStaking(
  addr: string,
  seconds: number
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log("Setting cooldown to staking with account:", deployer.address);

  const contract = new ethers.Contract(addr, STAKED_USDX_ABI.abi, deployer);
  await (contract.connect(deployer) as Contract).setCooldownDuration(seconds);

  console.log("Operation passed");
}

export async function deploy_Liquidity(
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

export async function deploy_OVA(admin: string): Promise<string> {
  const [deployer] = await ethers.getSigners();

  if (!ethers.isAddress(admin)) {
    throw new Error("admin is not ad address");
  }

  console.log("Deploying OVA contract with signer:", deployer.address);

  const ContractSource = await ethers.getContractFactory("OVA");
  const deployedContract = await ContractSource.deploy(admin);

  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
  return await deployedContract.getAddress();
}

export async function Liquidity_addReward(
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

export async function Liquidity_addPool(
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

export async function grantRole(
  addr: string,
  abi: any,
  role: string,
  to: string
) {
  const [admin] = await ethers.getSigners();
  const contract = new ethers.Contract(addr, abi, admin);
  console.log("Granting role:", role, "with address:", admin.address);
  await (contract.connect(admin) as Contract).grantRole(
    ethers.keccak256(ethers.toUtf8Bytes(role)),
    to
  );

  console.log("Role granted");
}

export async function USDO_proposeNewCollateralSpender(
  addr: string,
  spender: string
) {
  const [admin] = await ethers.getSigners();
  const contract = new ethers.Contract(addr, USDO_ABI.abi, admin);
  console.log("Proposing new collateral spender:", spender);
  await (contract.connect(admin) as Contract).proposeNewCollateralSpender(
    spender
  );
  console.log("Spender proposed");
}

export async function USDO_mint(addr: string, order: any) {
  const [admin] = await ethers.getSigners();
  const contract = new ethers.Contract(addr, USDO_ABI.abi, admin);
  console.log("Minting USDO with account:", admin.address);
  await (contract.connect(admin) as Contract).mint(order);
  console.log("USDO minted");
}

export async function StakedUSDO_deposit(
  addr: string,
  amount: string,
  recipient: string
) {
  const [admin] = await ethers.getSigners();
  const contract = new ethers.Contract(addr, SUSDO_ABI.abi, admin);
  console.log(
    "Depositing USDO into staking account with singer:",
    admin.address
  );
  await (contract.connect(admin) as Contract).deposit(
    ethers.parseEther(amount),
    recipient
  );
  console.log(
    "USDO staked, sUSDO balance:",
    ethers.formatEther(await contract.balanceOf(admin.address))
  );
}

export async function deploy_USDOBacking(
  admin: string,
  treasury: string,
  usdo: string,
  susdo: string
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying USDOBacking contract with signer:", deployer.address);

  const USDOBacking = await ethers.getContractFactory("USDOBacking");
  const usdobacking = await USDOBacking.deploy(admin, treasury, usdo, susdo, {
    maxFeePerGas: 9702346660
  });
  await usdobacking.waitForDeployment();

  console.log("Contract deployed at:", await usdobacking.getAddress());
  return await usdobacking.getAddress();
}
