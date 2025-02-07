import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  AUSDC_ADDRESS,
  AUSDT_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS
} from "./addresses";
import STAKED_USDX_ABI from "../artifacts/contracts/token/StakedUSDOFront.sol/StakedUSDOFront.json";
import LIQUIDITY_ABI from "../artifacts/contracts/liquidity/Liquidity.sol/Liquidity.json";
import USDO_ABI from "../artifacts/contracts/token/USDO.sol/USDO.json";
import OVAREFERRAL_ABI from "../artifacts/contracts/token/OvaReferral.sol/OvaReferral.json";
import SUSDO_ABI from "../artifacts/contracts/token/StakedUSDOFront.sol/StakedUSDOFront.json";
import { ILiquidity } from "./types";
import { USDC_ABI } from "./abi/USDC_abi";
import { USDT_ABI } from "./abi/USDT_abi";
import { sign } from "crypto";

export async function deploy_ERC20(
  name: string,
  initialSupply: string,
  baseGasFeeMult?: number
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  console.log(`Deploying ${name} contract with signer: ${deployer.address}`);

  const ContractSource = await ethers.getContractFactory("TestToken");
  const deployedContract = await ContractSource.deploy(
    ethers.parseEther(initialSupply),
    name,
    name,
    { gasLimit: 1000000 }
  );
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());

  return await deployedContract.getAddress();
}

export async function deploy_Dispatcher(
  admin: string,
  team: string,
  safetyModule: string,
  buyBack: string,
  usdo: string,
  baseGasFeeMult?: number
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Deploying Ova dispatcher contract with signer:",
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory("OvaDispatcher");
  const deployedContract = await ContractSource.deploy(
    admin,
    team,
    safetyModule,
    buyBack,
    usdo,
    { gasLimit: 1000000 }
  );
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());

  return await deployedContract.getAddress();
}

export async function deploy_USDO(
  usdc: string,
  usdcDecimals: number,
  usdt: string,
  usdtDecimals: number,
  ausdc: string,
  ausdcDecimals: number,
  ausdt: string,
  ausdtDecimals: number,
  approveDeployerCollateral?: boolean,
  baseGasFeeMult?: number
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying USDO contract with signer:", deployer.address);

  const ContractSource = await ethers.getContractFactory("USDO");
  const deployedContract = await ContractSource.deploy(
    deployer.address,
    {
      addr: usdc,
      decimals: usdcDecimals
    },
    {
      addr: usdt,
      decimals: usdtDecimals
    },
    {
      addr: ausdc,
      decimals: ausdcDecimals
    },
    {
      addr: ausdt,
      decimals: ausdtDecimals
    },
    ethers.parseEther("100000000"),
    ethers.parseEther("100000000"),
    { gasLimit: 10000000 }
  );
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());

  if (approveDeployerCollateral) {
    const usdcContract = new ethers.Contract(usdc, USDC_ABI, deployer);
    const usdtContract = new ethers.Contract(usdt, USDT_ABI, deployer);
    let tx = await (usdcContract.connect(deployer) as Contract).approve(
      await deployedContract.getAddress(),
      ethers.MaxUint256,
      { gasLimit: 10000000 }
    );
    let receipt = await tx.wait();
    console.log(`Approved deployer spender <USDO, USDC> hash = ${tx.hash}`);

    tx = await (usdtContract.connect(deployer) as Contract).approve(
      await deployedContract.getAddress(),
      ethers.MaxUint256,
      { gasLimit: 10000000 }
    );
    receipt = await tx.wait();
    console.log(`Approved deployer spender <USDO, USDT> hash = ${tx.hash}`);
  }

  return await deployedContract.getAddress();
}

export async function deploy_StakedUSDO(
  usdo: string,
  baseGasFeeMult?: number
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying StakedUSDO contract with signer:", deployer.address);

  const ContractSource = await ethers.getContractFactory("StakedUSDOFront");
  const deployedContract = await ContractSource.deploy(
    usdo,
    deployer.address,
    deployer.address,
    0,
    {
      gasLimit: 10000000
    }
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
  const deployedContract = await ContractSource.deploy(usdo, deployer.address);
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
}

export async function deploy_AirdropReward(
  admin: string,
  baseGasFeeMult?: number
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  if (!ethers.isAddress(admin)) {
    throw new Error("admin is not an address");
  }

  console.log(
    "Deploying Airdrop::Reward contract with signer:",
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory("OvaReferral");
  const deployedContract = await ContractSource.deploy(admin, {
    gasLimit: 10000000
  });
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
  return await deployedContract.getAddress();
}

export async function AirdropReward_setStakingPools(
  addr: string,
  pools: string[],
  baseGasFeeMult?: number
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Setting ova referral token staking pools with:",
    deployer.address
  );
  console.log("Address:", addr);
  console.log("Pools:", pools);

  const contract = new ethers.Contract(addr, OVAREFERRAL_ABI.abi, deployer);
  const tx = await (contract.connect(deployer) as Contract).setStakingPools(
    pools,
    {
      gasLimit: 10000000
    }
  );
  const receipt = await tx.wait();

  console.log("Staking pools set to OvaReferral hash =", tx.hash);
}

export async function AirdropReward_addTrackers(
  addr: string,
  trackers: string[],
  baseGasFeeMult?: number
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log("Setting ova referral token trackers with:", deployer.address);
  console.log("Address:", addr);
  console.log("Trackers:", trackers);

  const contract = new ethers.Contract(addr, OVAREFERRAL_ABI.abi, deployer);
  for (const t of trackers) {
    const tx = await (contract.connect(deployer) as Contract).addPointsTracker(
      t,
      {
        gasLimit: 10000000
      }
    );
    const receipt = await tx.wait();
    console.log("Set OvaReferral token tracker hash =", tx.hash);
  }
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
  const deployedContract = await ContractSource.deploy(admin);
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
  return await deployedContract.getAddress();
}

export async function StakedUSDO_setCooldownStaking(
  addr: string,
  seconds: number,
  baseGasFeeMult?: number
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log("Setting cooldown to staking with account:", deployer.address);

  const contract = new ethers.Contract(addr, STAKED_USDX_ABI.abi, deployer);
  const tx = await (contract.connect(deployer) as Contract).setCooldownDuration(
    seconds,
    {
      gasLimit: 10000000
    }
  );
  const receipt = await tx.wait();

  console.log("sUSDO cooldown set hash =", tx.hash);
}

export async function deploy_AirdropPoolCurveStableStake(
  admin: string
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  if (!ethers.isAddress(admin)) {
    throw new Error("admin is not ad address");
  }

  console.log(
    "Deploying Airdrop::CurveStableStake contract with signer:",
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory("CurveStableStake");
  const deployedContract = await ContractSource.deploy(admin);

  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
  return await deployedContract.getAddress();
}

export async function deploy_AirdropSingleStableStake(
  admin: string,
  baseGasFeeMult?: number
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  if (!ethers.isAddress(admin)) {
    throw new Error("admin is not ad address");
  }

  console.log(
    "Deploying Airdrop::SingleStableStake contract with signer:",
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory("SingleStableStake");
  const deployedContract = await ContractSource.deploy(admin, {
    gasLimit: 10000000
  });

  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
  return await deployedContract.getAddress();
}

export async function deploy_Liquidity(admin: string): Promise<string> {
  const [deployer] = await ethers.getSigners();

  if (!ethers.isAddress(admin)) {
    throw new Error("admin is not ad address");
  }

  console.log("Deploying Liquidity contract with signer:", deployer.address);

  const ContractSource = await ethers.getContractFactory("Liquidity");
  const deployedContract = await ContractSource.deploy(admin);

  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
  return await deployedContract.getAddress();
}

export async function Liquidity_updateReferral(
  addr: string,
  ref: string,
  baseGasFeeMult?: number
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Setting ova referral address to staking pool with:",
    deployer.address
  );

  const contract = new ethers.Contract(addr, LIQUIDITY_ABI.abi, deployer);
  const tx = await (contract.connect(deployer) as Contract).updateReferral(
    ref,
    {
      gasLimit: 10000000
    }
  );
  const receipt = await tx.wait();

  console.log("Liquidity referral updated hash =", tx.hash);
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

export async function CurveStableStake_setRewardForStakedAssets(
  contract: any, // ether contract
  signer: any, // hardhat ether signer
  rewardAddr: string,
  rateNum: number,
  rateDen: number
): Promise<void> {
  console.log(
    "Airdrop::CurveStableStake adding reward",
    rewardAddr,
    "with rate",
    rateNum / rateDen,
    "for dollar liquidity (year)"
  );
  await contract
    .connect(signer)
    .setRewardForStakedAssets(rewardAddr, rateNum, rateDen);
  console.log("Airdrop::CurveStableStake reward added");
}

export async function SingleStableStake_setRewardForStakedAssets(
  contract: any, // ether contract
  signer: any, // hardhat ether signer
  rewardAddr: string,
  rateNum: number,
  rateDen: number,
  baseGasFeeMult?: number
): Promise<void> {
  console.log(
    "Airdrop::SingleStableStake adding reward",
    rewardAddr,
    "with rate",
    rateNum / rateDen,
    "for dollar liquidity (year)"
  );

  const tx = await contract
    .connect(signer)
    .setRewardForStakedAssets(rewardAddr, rateNum, rateDen, {
      gasLimit: 10000000
    });
  const receipt = await tx.hash;
  console.log("Airdrop::SingleStableStake reward added hash =", tx.hash);
}

export async function CurveStableStake_addWithNumCoinsAndPool(
  contract: any, // ether contract
  signer: any, // hardhat ether signer
  stakedAddr: string,
  rewardAddr: string,
  allocPoints: number,
  numCoins: number,
  pool: string,
  endTime: number,
  vested: boolean,
  update: boolean
): Promise<void> {
  console.log(
    "Airdrop::CurveStableStake adding pool. In",
    stakedAddr,
    "Out",
    rewardAddr
  );
  await contract
    .connect(signer)
    .addWithNumCoinsAndPool(
      stakedAddr,
      rewardAddr,
      allocPoints,
      numCoins,
      pool,
      endTime,
      vested,
      update
    );
  console.log("Airdrop::CurveStableStake pool added");
}

export async function SingleStableStake_addPool(
  contract: any, // ether contract
  signer: any, // hardhat ether signer
  stakedAddr: string,
  rewardAddr: string,
  allocPoints: number,
  endTime: number,
  vested: boolean,
  update: boolean,
  baseGasFeeMult?: number
): Promise<void> {
  console.log(
    "Airdrop::SingleStableStake adding pool. In",
    stakedAddr,
    "Out",
    rewardAddr
  );

  const tx = await contract
    .connect(signer)
    .add(stakedAddr, rewardAddr, allocPoints, endTime, vested, update, {
      gasLimit: 10000000
    });
  const receipt = await tx.wait();
  console.log("Airdrop::SingleStableStake pool added hash =", tx.hash);
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
  to: string,
  baseGasFeeMult?: number
) {
  const [admin] = await ethers.getSigners();

  const defaultTransactionOptions = {
    gasLimit: 10000000
  };
  const contract = new ethers.Contract(addr, abi, admin);
  console.log("Granting role:", role, "with address:", admin.address);
  const tx = await (contract.connect(admin) as Contract).grantRole(
    ethers.keccak256(ethers.toUtf8Bytes(role)),
    to,
    defaultTransactionOptions
  );
  const receipt = await tx.wait();

  console.log("Role granted hash =", tx.hash);
}

export async function USDO_proposeNewCollateralSpender(
  addr: string,
  spender: string,
  baseGasFeeMult?: number
) {
  const [admin] = await ethers.getSigners();

  const defaultTransactionOptions = {
    gasLimit: 10000000
  };

  const contract = new ethers.Contract(addr, USDO_ABI.abi, admin);
  console.log("Proposing new collateral spender:", spender);
  const tx = await (
    contract.connect(admin) as Contract
  ).proposeNewCollateralSpender(spender, defaultTransactionOptions);
  const receipt = await tx.wait();
  console.log("Spender proposed hash =", tx.hash);
}

export async function USDO_mint(
  addr: string,
  order: any,
  baseGasFeeMult?: number
) {
  const [admin] = await ethers.getSigners();

  const contract = new ethers.Contract(addr, USDO_ABI.abi, admin);
  console.log("Minting USDO with account:", admin.address);
  const tx = await (contract.connect(admin) as Contract).mint(order, {
    gasLimit: 10000000
  });
  const receipt = await tx.wait();
  console.log("USDO minted hash =", tx.hash);
}

export async function StakedUSDO_deposit(
  addr: string,
  amount: string,
  recipient: string,
  baseGasFeeMult?: number
) {
  const [admin] = await ethers.getSigners();

  const contract = new ethers.Contract(addr, SUSDO_ABI.abi, admin);
  console.log(
    "Depositing USDO into staking account with singer:",
    admin.address
  );
  const tx = await (contract.connect(admin) as Contract).deposit(
    ethers.parseEther(amount),
    recipient,
    {
      gasLimit: 10000000
    }
  );
  const receipt = await tx.wait();
  console.log("USDO staked hash =", tx.hash);
}

export async function deploy_USDOBacking(
  admin: string,
  treasury: string,
  usdo: string,
  susdo: string,
  baseGasFeeMult?: number
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying USDOBacking contract with signer:", deployer.address);

  const USDOBacking = await ethers.getContractFactory("USDOBacking");
  const usdobacking = await USDOBacking.deploy(admin, treasury, usdo, susdo, {
    gasLimit: 10000000
  });
  await usdobacking.waitForDeployment();

  console.log("Contract deployed at:", await usdobacking.getAddress());
  return await usdobacking.getAddress();
}

export function decodeCustomError(error: any, abi: any) {
  const iface = new ethers.Interface(abi);
  if (error.data) {
    try {
      const decodedError = iface.parseError(error.data);
      console.log("Custom error decoded:", decodedError);
    } catch (e) {
      console.error("Unable to decode custom error:", e);
    }
  } else {
    console.error("No return data in error:", error);
  }
}
