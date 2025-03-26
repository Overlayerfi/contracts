import { ethers } from "hardhat";
import {
  AUSDC_ADDRESS,
  AUSDT_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS
} from "./addresses";
import STAKED_USDX_ABI from "../artifacts/contracts/token/StakedUSDOFront.sol/StakedUSDOFront.json";
import rOVA_ABI from "../artifacts/contracts/token/rOVA.sol/rOVA.json";
import rOVAV2_ABI from "../artifacts/contracts/token/rOVAV2.sol/rOVAV2.json";
import OVAWHITELIST_ABI from "../artifacts/contracts/whitelist/OvaWhitelist.sol/OvaWhitelist.json";
import SUBSCRIPTIONCONSUMERSEPOLIA_ABI from "../artifacts/contracts/sepolialottery/OvaExtractorSepolia.sol/OvaExtractorSepolia.json";
import TESTMATH_ABI from "../artifacts/contracts/test/TestMath.sol/TestMath.json";
import LIQUIDITY_ABI from "../artifacts/contracts/liquidity/Liquidity.sol/Liquidity.json";
import USDO_ABI from "../artifacts/contracts/token/USDO.sol/USDO.json";
import OVAREFERRAL_ABI from "../artifacts/contracts/token/OvaReferral.sol/OvaReferral.json";
import SUSDO_ABI from "../artifacts/contracts/token/StakedUSDOFront.sol/StakedUSDOFront.json";
import { ILiquidity } from "./types";
import { USDC_ABI } from "./abi/USDC_abi";
import { USDT_ABI } from "./abi/USDT_abi";

export async function deploy_USDO(
  approveDeployerCollateral?: boolean,
  baseGasFeeMult?: number
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying USDO contract with signer:", deployer.address);

  const block = await deployer.provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const maxFee =
    baseFee * BigInt(baseGasFeeMult !== undefined ? baseGasFeeMult : 1);
  const defaultTransactionOptions = {
    maxFeePerGas: maxFee
  };

  const ContractSource = await ethers.getContractFactory("USDO");
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
    {
      addr: AUSDC_ADDRESS,
      decimals: 6
    },
    {
      addr: AUSDT_ADDRESS,
      decimals: 6
    },
    ethers.parseEther("100000000"),
    ethers.parseEther("100000000"),
    defaultTransactionOptions
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

export async function deploy_StakedUSDO(
  usdo: string,
  baseGasFeeMult?: number
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  const block = await deployer.provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const maxFee =
    baseFee * BigInt(baseGasFeeMult !== undefined ? baseGasFeeMult : 1);
  const defaultTransactionOptions = {
    maxFeePerGas: maxFee
  };

  console.log("Deploying StakedUSDO contract with signer:", deployer.address);

  const ContractSource = await ethers.getContractFactory("StakedUSDOFront");
  const deployedContract = await ContractSource.deploy(
    usdo,
    deployer.address,
    deployer.address,
    0,
    defaultTransactionOptions
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

export async function deploy_AirdropReward(admin: string): Promise<string> {
  const [deployer] = await ethers.getSigners();

  if (!ethers.isAddress(admin)) {
    throw new Error("admin is not an address");
  }

  console.log(
    "Deploying Airdrop::Reward contract with signer:",
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory("OvaReferral");
  const deployedContract = await ContractSource.deploy(admin);
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
  return await deployedContract.getAddress();
}

export async function AirdropReward_setStakingPools(
  addr: string,
  pools: string[]
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Setting ova referral token staking pools with:",
    deployer.address
  );
  console.log("Address:", addr);
  console.log("Pools:", pools);

  const contract = new ethers.Contract(addr, OVAREFERRAL_ABI.abi, deployer);
  await (contract.connect(deployer) as Contract).setStakingPools(pools);

  console.log("Operation passed");
}

export async function AirdropReward_addTrackers(
  addr: string,
  trackers: string[]
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log("Setting ova referral token trackers with:", deployer.address);
  console.log("Address:", addr);
  console.log("Trackers:", trackers);

  const contract = new ethers.Contract(addr, OVAREFERRAL_ABI.abi, deployer);
  for (const t of trackers) {
    await (contract.connect(deployer) as Contract).addPointsTracker(t);
  }
  console.log("Operation passed");
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
  seconds: number
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log("Setting cooldown to staking with account:", deployer.address);

  const contract = new ethers.Contract(addr, STAKED_USDX_ABI.abi, deployer);
  await (contract.connect(deployer) as Contract).setCooldownDuration(seconds);

  console.log("Operation passed");
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
  admin: string
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
  const deployedContract = await ContractSource.deploy(admin);

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
  ref: string
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Setting ova referral address to staking pool with:",
    deployer.address
  );

  const contract = new ethers.Contract(addr, LIQUIDITY_ABI.abi, deployer);
  await (contract.connect(deployer) as Contract).updateReferral(ref);

  console.log("Operation passed");
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
  rateDen: number
): Promise<void> {
  console.log(
    "Airdrop::SingleStableStake adding reward",
    rewardAddr,
    "with rate",
    rateNum / rateDen,
    "for dollar liquidity (year)"
  );
  await contract
    .connect(signer)
    .setRewardForStakedAssets(rewardAddr, rateNum, rateDen);
  console.log("Airdrop::SingleStableStake reward added");
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
  update: boolean
): Promise<void> {
  console.log(
    "Airdrop::SingleStableStake adding pool. In",
    stakedAddr,
    "Out",
    rewardAddr
  );
  await contract
    .connect(signer)
    .add(stakedAddr, rewardAddr, allocPoints, endTime, vested, update);
  console.log("Airdrop::SingleStableStake pool added");
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
  const usdobacking = await USDOBacking.deploy(admin, treasury, usdo, susdo);
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

export async function deploy_OvaWhitelist(admin: string): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying OvaWhitelist contract with signer:", deployer.address);

  const ContractSource = await ethers.getContractFactory("OvaWhitelist");
  const deployedContract = await ContractSource.deploy(admin);
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
}

export async function OvaWhitelist_add(
  contractAddress: string,
  who: string[],
  signer: any
) {
  for (const c of who) {
    if (!ethers.isAddress(c)) {
      throw new Error(`${c} is not a valid address`);
    }
  }
  if (!ethers.isAddress(contractAddress)) {
    throw new Error(`${contractAddress} is not a valid address`);
  }

  try {
    const contract = new ethers.Contract(
      contractAddress,
      OVAWHITELIST_ABI.abi,
      signer
    );
    for (const a of who) {
      const tx = await contract.connect(signer).add(a);
      const recepit = await tx.wait();
      console.log(
        `${a} added to whitelist. Transaction executed at ${tx.hash}`
      );
    }
  } catch (e) {
    console.error(e);
  }
}

export async function OvaWhitelist_count(
  contractAddress: string,
  provider: any
) {
  if (!ethers.isAddress(contractAddress)) {
    throw new Error(`${contractAddress} is not a valid address`);
  }

  try {
    const contract = new ethers.Contract(
      contractAddress,
      OVAWHITELIST_ABI.abi,
      provider
    );
    const tx = await contract.users();
    return tx;
  } catch (e) {
    console.error(e);
    return -1;
  }
}

export async function OvaWhitelist_verify(
  contractAddress: string,
  who: string[],
  provider: any
) {
  for (const c of who) {
    if (!ethers.isAddress(c)) {
      throw new Error(`${c} is not a valid address`);
    }
  }
  if (!ethers.isAddress(contractAddress)) {
    throw new Error(`${contractAddress} is not a valid address`);
  }

  try {
    const contract = new ethers.Contract(
      contractAddress,
      OVAWHITELIST_ABI.abi,
      provider
    );
    const res = [];
    for (const a of who) {
      const tx = await contract.whitelist(a);
      res.push({ address: a, res: tx });
    }
    return res;
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function OvaWhitelist_batchAdd(
  contractAddress: string,
  who: string[],
  signer: any
) {
  for (const c of who) {
    if (!ethers.isAddress(c)) {
      throw new Error(`${c} is not a valid address`);
    }
  }
  if (!ethers.isAddress(contractAddress)) {
    throw new Error(`${contractAddress} is not a valid address`);
  }

  try {
    const contract = new ethers.Contract(
      contractAddress,
      OVAWHITELIST_ABI.abi,
      signer
    );
    const tx = await contract
      .connect(signer)
      .batchAdd(who, { gasLimit: 10000000 });
    const recepit = await tx.wait();
    console.log(
      `${who} added to whitelist. Transaction executed at ${tx.hash}`
    );
  } catch (e) {
    console.error(e);
  }
}

export async function OvaWhitelist_remove(
  contractAddress: string,
  who: string,
  signer: any
) {
  if (!ethers.isAddress(who)) {
    throw new Error(`${who} is not a valid address`);
  }
  if (!ethers.isAddress(contractAddress)) {
    throw new Error(`${contractAddress} is not a valid address`);
  }

  try {
    const contract = new ethers.Contract(
      contractAddress,
      OVAWHITELIST_ABI.abi,
      signer
    );
    const tx = await contract.connect(signer).remove(who);
    const recepit = await tx.wait();
    console.log(
      `${who} removed from whitelist. Transaction executed at ${tx.hash}`
    );
  } catch (e) {
    console.error(e);
  }
}

export async function deploy_SubscriptionConsumerSepolia(id: string) {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Deploying OvaExtractorSepolia contract with signer:",
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory("OvaExtractorSepolia");
  const deployedContract = await ContractSource.deploy(id);
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
}

export async function SubscriptionConsumerSepolia_addParticipants(
  contractAddress: string,
  handles: string[],
  signer: any
) {
  if (!ethers.isAddress(contractAddress)) {
    throw new Error(`${contractAddress} is not a valid address`);
  }

  try {
    const contract = new ethers.Contract(
      contractAddress,
      SUBSCRIPTIONCONSUMERSEPOLIA_ABI.abi,
      signer
    );
    const tx = await contract.connect(signer).setParticipants(handles);
    const recepit = await tx.wait();
    console.log("Transaction executed at", tx.hash);
  } catch (e) {
    console.error(e);
  }
}

export async function SubscriptionConsumerSepolia_request(
  contractAddress: string,
  signer: any
) {
  if (!ethers.isAddress(contractAddress)) {
    throw new Error(`${contractAddress} is not a valid address`);
  }

  try {
    const contract = new ethers.Contract(
      contractAddress,
      SUBSCRIPTIONCONSUMERSEPOLIA_ABI.abi,
      signer
    );
    const tx = await contract.connect(signer).requestRandomWords(true);
    const recepit = await tx.wait();
    console.log("Transaction executed at", tx.hash);
  } catch (e) {
    console.error(e);
  }
}

export async function SubscriptionConsumerSepolia_get(
  provider: any,
  contractAddress: string,
  id: string
) {
  if (!ethers.isAddress(contractAddress)) {
    throw new Error(`${contractAddress} is not a valid address`);
  }

  try {
    const contract = new ethers.Contract(
      contractAddress,
      SUBSCRIPTIONCONSUMERSEPOLIA_ABI.abi,
      provider
    );
    const res = await contract.getRequestStatus(id);
    console.log("Request:", res);
  } catch (e) {
    console.error(e);
  }
}

export async function deploy_TestMath() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying Math contract with signer:", deployer.address);

  const ContractSource = await ethers.getContractFactory("TestMath");
  const deployedContract = await ContractSource.deploy({
    maxFeePerGas: 10000000000
  });
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
}

export async function TestMath_mod(
  provider: any,
  contractAddress: string,
  a: string,
  b: string
) {
  if (!ethers.isAddress(contractAddress)) {
    throw new Error(`${contractAddress} is not a valid address`);
  }

  try {
    const contract = new ethers.Contract(
      contractAddress,
      TESTMATH_ABI.abi,
      provider
    );
    const res = await contract.testMod(
      ethers.parseUnits(a, 0),
      ethers.parseUnits(b, 0)
    );
    console.log("Mod:", res);
  } catch (e) {
    console.error(e);
  }
}

export async function deploy_rOVAV2(deploymentGas: {
  gasLimit: number;
  maxFeePerGas: number;
}) {
  try {
    const [signer] = await ethers.getSigners();
    console.log(`Deploying rOVA with ${signer.address}`);
    const rOVA = await ethers.getContractFactory("rOVAV2");
    const rova = await rOVA.deploy(signer.address, deploymentGas);
    await rova.waitForDeployment();
    console.log(`Contract deployed at ${await rova.getAddress()}`);
  } catch (e) {
    console.error(e);
  }
}

export async function deploy_rOVA(deploymentGas: {
  gasLimit: number;
  maxFeePerGas: number;
}) {
  try {
    const [signer] = await ethers.getSigners();
    console.log(`Deploying rOVA with ${signer.address}`);
    const rOVA = await ethers.getContractFactory("rOVA");
    const rova = await rOVA.deploy(signer.address, deploymentGas);
    await rova.waitForDeployment();
    console.log(`Contract deployed at ${await rova.getAddress()}`);
  } catch (e) {
    console.error(e);
  }
}

export async function rOVAV2_addBatch(
  signer: any,
  contractAddr: string,
  who: string[],
  amount: any[],
  deploymentGas: { gasLimit: number; maxFeePerGas: number }
) {
  try {
    if (!ethers.isAddress(contractAddr)) {
      throw new Error(`${contractAddr} is not a valid address`);
    }
    const contract = new ethers.Contract(contractAddr, rOVAV2_ABI.abi, signer);
    console.log(`Adding batch rOVA with ${signer.address}`);
    const tx = await contract.batchAdd(who, amount, deploymentGas);
    const receipt = await tx.wait();
    console.log(`Executed at ${tx.hash}`);
  } catch (e) {
    console.error(e);
  }
}

export async function rOVA_addBatch(
  signer: any,
  contractAddr: string,
  who: string[],
  amount: any[],
  type: number,
  deploymentGas: { gasLimit: number; maxFeePerGas: number }
) {
  try {
    if (!ethers.isAddress(contractAddr)) {
      throw new Error(`${contractAddr} is not a valid address`);
    }
    if (type != 0 && type != 1) {
      throw new Error(`${type} must be 0 for USDT and 1 for rOVA`);
    }
    const contract = new ethers.Contract(contractAddr, rOVA_ABI.abi, signer);
    console.log(`Adding batch rOVA with ${signer.address}`);
    const tx = await contract.batchAdd(who, amount, type, deploymentGas);
    const receipt = await tx.wait();
    console.log(`Executed at ${tx.hash}`);
  } catch (e) {
    console.error(e);
  }
}

export async function rOVA_removeBatch(
  signer: any,
  contractAddr: string,
  who: string[],
  type: number,
  deploymentGas: { gasLimit: number; maxFeePerGas: number }
) {
  try {
    if (!ethers.isAddress(contractAddr)) {
      throw new Error(`${contractAddr} is not a valid address`);
    }
    if (type != 0 && type != 1) {
      throw new Error(`${type} must be 0 for USDT and 1 for rOVA`);
    }
    const contract = new ethers.Contract(contractAddr, rOVA_ABI.abi, signer);
    console.log(`Removing batch rOVA with ${signer.address}`);
    const tx = await contract.batchRemove(who, type, deploymentGas);
    const receipt = await tx.wait();
    console.log(`Executed at ${tx.hash}`);
  } catch (e) {
    console.error(e);
  }
}
