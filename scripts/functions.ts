import { ethers } from "hardhat";
import {
  AUSDC_ADDRESS,
  AUSDT_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS
} from "./addresses";
import STAKED_USDX_ABI from "../artifacts/contracts/overlayer/StakedOverlayerWrapFront.sol/StakedOverlayerWrapFront.json";
import rOVA_ABI from "../artifacts/contracts/overlayer/rOVA.sol/rOVA.json";
import rOVAV2_ABI from "../artifacts/contracts/overlayer/rOVAV2.sol/rOVAV2.json";
import OVAWHITELIST_ABI from "../artifacts/contracts/whitelist/OvaWhitelist.sol/OvaWhitelist.json";
import SUBSCRIPTIONCONSUMERSEPOLIA_ABI from "../artifacts/contracts/sepolialottery/OvaExtractorSepolia.sol/OvaExtractorSepolia.json";
import TESTMATH_ABI from "../artifacts/contracts/test/TestMath.sol/TestMath.json";
import LIQUIDITY_ABI from "../artifacts/contracts/liquidity/Liquidity.sol/Liquidity.json";
import OverlayerWrap_ABI from "../artifacts/contracts/overlayer/OverlayerWrap.sol/OverlayerWrap.json";
import OVAREFERRAL_ABI from "../artifacts/contracts/overlayer/OvaReferral.sol/OvaReferral.json";
import SOverlayerWrap_ABI from "../artifacts/contracts/overlayer/StakedOverlayerWrapFront.sol/StakedOverlayerWrapFront.json";
import { ILiquidity } from "./types";
import { USDC_ABI } from "./abi/USDC_abi";
import { USDT_ABI } from "./abi/USDT_abi";

export async function deploy_ERC20(
  name: string,
  initialSupply: string,
  baseGasFeeMult?: number
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  console.log(`Deploying ${name} contract with signer: ${deployer.address}`);

  const block = await deployer.provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const maxFee =
    baseFee * BigInt(baseGasFeeMult !== undefined ? baseGasFeeMult : 1);
  const defaultTransactionOptions = {
    maxFeePerGas: maxFee,
    gasLimit: 2000000
  };

  const ContractSource = await ethers.getContractFactory("TestToken");
  const deployedContract = await ContractSource.deploy(
    ethers.parseUnits(initialSupply, 1),
    name,
    name,
    defaultTransactionOptions
  );
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());

  return await deployedContract.getAddress();
}

export async function deploy_OverlayerWrap(
  usdtAddr: string,
  aUsdtAddr: string,
  approveDeployerCollateral?: boolean,
  baseGasFeeMult?: number
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Deploying OverlayerWrap contract with signer:",
    deployer.address
  );

  const block = await deployer.provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const maxFee =
    baseFee * BigInt(baseGasFeeMult !== undefined ? baseGasFeeMult : 1);
  const defaultTransactionOptions = {
    maxFeePerGas: maxFee
  };

  const Factory = await ethers.getContractFactory("OverlayerWrapFactory");
  const factory = await Factory.deploy(
    await deployer.getAddress(),
    await deployer.getAddress(),
    defaultTransactionOptions
  );
  await factory.waitForDeployment();

  const overlayerWrapAddressTx = await factory.deployInitialOverlayerWrap(
    {
      addr: usdtAddr,
      decimals: 6
    },
    {
      addr: aUsdtAddr,
      decimals: 6
    },
    ethers.parseEther("100000000"),
    ethers.parseEther("100000000")
  );
  await overlayerWrapAddressTx.wait();
  const overlayerWrapAddress = await factory.symbolToToken("USDT+");

  console.log("Contract deployed at:", overlayerWrapAddress);

  if (approveDeployerCollateral) {
    const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, deployer);
    await (usdt.connect(deployer) as Contract).approve(
      overlayerWrapAddress,
      ethers.MaxUint256
    );
  }

  return await overlayerWrapAddress;
}

export async function deploy_StakedOverlayerWrap(
  overlayerWrap: string,
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

  console.log(
    "Deploying StakedOverlayerWrap contract with signer:",
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory(
    "StakedOverlayerWrapFront"
  );
  const deployedContract = await ContractSource.deploy(
    overlayerWrap,
    deployer.address,
    deployer.address,
    0,
    defaultTransactionOptions
  );
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
  return await deployedContract.getAddress();
}

export async function deploy_AirdropOVAReceipt(
  overlayerWrap: string
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Deploying AirdropOVAReceipt contract with signer:",
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory("AirdropOVAReceipt");
  const deployedContract = await ContractSource.deploy(
    overlayerWrap,
    deployer.address
  );
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
  await (contract.connect(deployer) as Contract).setStakingPools(pools, {
    gasLimit: 2000000
  });

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
    await (contract.connect(deployer) as Contract).addPointsTracker(t, {
      gasLimit: 2000000
    });
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

export async function StakedOverlayerWrap_setCooldownStaking(
  addr: string,
  seconds: number
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log("Setting cooldown to staking with account:", deployer.address);

  const contract = new ethers.Contract(addr, STAKED_USDX_ABI.abi, deployer);
  await (contract.connect(deployer) as Contract).setCooldownDuration(seconds, {
    gasLimit: 2000000
  });

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
  ref: string
): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Setting ova referral address to staking pool with:",
    deployer.address
  );

  const contract = new ethers.Contract(addr, LIQUIDITY_ABI.abi, deployer);
  await (contract.connect(deployer) as Contract).updateReferral(ref, {
    gasLimit: 2000000
  });

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
      gasLimit: 2000000
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
    { gasLimit: 4000000 }
  );
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());

  return await deployedContract.getAddress();
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
      gasLimit: 2000000
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
    gasLimit: 2000000
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

export async function OverlayerWrap_proposeNewCollateralSpender(
  addr: string,
  spender: string
) {
  const [admin] = await ethers.getSigners();
  const contract = new ethers.Contract(addr, OverlayerWrap_ABI.abi, admin);
  console.log("Proposing new collateral spender:", spender);
  await (contract.connect(admin) as Contract).proposeNewCollateralSpender(
    spender
  );
  console.log("Spender proposed");
}

export async function OverlayerWrap_mint(addr: string, order: any) {
  const [admin] = await ethers.getSigners();
  const contract = new ethers.Contract(addr, OverlayerWrap_ABI.abi, admin);
  console.log("Minting OverlayerWrap with account:", admin.address);
  await (contract.connect(admin) as Contract).mint(order, {
    gasLimit: 2000000
  });
  console.log("OverlayerWrap minted");
}

export async function StakedOverlayerWrap_deposit(
  addr: string,
  amount: string,
  recipient: string
) {
  const [admin] = await ethers.getSigners();
  const contract = new ethers.Contract(addr, SOverlayerWrap_ABI.abi, admin);
  console.log(
    "Depositing OverlayerWrap into staking account with singer:",
    admin.address
  );
  await (contract.connect(admin) as Contract).deposit(
    ethers.parseEther(amount),
    recipient,
    {
      gasLimit: 2000000
    }
  );
  console.log(
    "OverlayerWrap staked, sOverlayerWrap balance:",
    ethers.formatEther(await contract.balanceOf(admin.address))
  );
}

export async function deploy_OverlayerWrapBacking(
  admin: string,
  treasury: string,
  overlayerWrap: string,
  soverlayerWrap: string
): Promise<string> {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Deploying OverlayerWrapBacking contract with signer:",
    deployer.address
  );

  const OverlayerWrapBacking = await ethers.getContractFactory(
    "OverlayerWrapBacking"
  );
  const overlayerWrapbacking = await OverlayerWrapBacking.deploy(
    admin,
    treasury,
    overlayerWrap,
    soverlayerWrap,
    {
      gasLimit: 10000000
    }
  );
  await overlayerWrapbacking.waitForDeployment();

  console.log("Contract deployed at:", await overlayerWrapbacking.getAddress());
  return await overlayerWrapbacking.getAddress();
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
export async function deploy_SepoliaFaucet(
  usdt: string,
  overlayerWrap_usdt: string
): Promise<void> {
  const [deployer] = await ethers.getSigners();
  for (const c of [usdt, overlayerWrap_usdt]) {
    if (!ethers.isAddress(c)) {
      throw new Error(`${c} is not a valid address`);
    }
  }

  console.log(
    "Deploying SepoliaFaucet contract with signer:",
    deployer.address
  );

  const ContractSource = await ethers.getContractFactory("OvaSepoliaFaucet");
  const deployedContract = await ContractSource.deploy(
    usdt,
    overlayerWrap_usdt
  );
  await deployedContract.waitForDeployment();

  console.log("Contract deployed at:", await deployedContract.getAddress());
}
