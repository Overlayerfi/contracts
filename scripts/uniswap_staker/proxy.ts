import { ethers } from "hardhat";
import ProxyAbi from "../../artifacts/contracts/uniswap/UniswapV3StakerFront.sol/UniswapV3StakerFront.json";
import UNIV3_STAKER_ABI from "../../artifacts/contracts/uniswap/UniswapV3StakerFront.sol/UniswapV3StakerFront.json";
import RewardAbi from "../../artifacts/contracts/mock_ERC20/FixedSupplyERC20.sol/FixedSupplyERC20.json";
import { UNIV3_NFT_POSITION_MANAGER } from "../addresses";
import { UNIV3_NFT_POSITION_MANAGER_ABI } from "../abi/UNIV3_NFT_POSITION_MANAGER";
import { Signer } from "ethers";

export interface IncentiveKey {
  rewardToken: string;
  pool: string;
  startTime: number;
  endTime: number;
  refundee: string;
}

// Note, each function will use as signer the default signer returned by `ethers.getSigners()`

export async function rewardBalance(reward: string, addr?: string) {
  const [deployer] = await ethers.getSigners();
  const rewardContract = new ethers.Contract(reward, RewardAbi.abi, deployer);

  const bal = await rewardContract.balanceOf(
    addr !== undefined ? addr : deployer.address
  );
  return ethers.formatEther(bal);
}

export async function recoverDeposit(tokenId: string, uni: string) {
  const [deployer] = await ethers.getSigners();
  const proxyContract = new ethers.Contract(uni, ProxyAbi.abi, deployer);

  await proxyContract.recoverDeposit(tokenId);
  console.log(`Token ${tokenId} deposit recovered to ${deployer.address}`);
}

export async function tokenOwner(tokenId: string) {
  const [deployer] = await ethers.getSigners();
  const nftPositionManagerContract = new ethers.Contract(
    UNIV3_NFT_POSITION_MANAGER,
    UNIV3_NFT_POSITION_MANAGER_ABI,
    deployer
  );

  return await nftPositionManagerContract.ownerOf(
    ethers.parseUnits(tokenId, 0)
  );
}

export async function unstake(
  tokenId: string,
  key: IncentiveKey,
  uni: string,
  reward: string,
  recipient: string,
  deployer: Signer
) {
  const proxyContract = new ethers.Contract(uni, ProxyAbi.abi, deployer);

  const collected = await proxyContract.unstake(
    tokenId,
    key,
    reward,
    recipient,
    recipient
  );
  console.log(`Unstaked token ${tokenId}`);
  return collected;
}

export async function transferDeposit(
  UNIV3_STAKER: string,
  tokenId: string,
  to: string
) {
  const [deployer] = await ethers.getSigners();
  const staker = new ethers.Contract(
    UNIV3_STAKER,
    UNIV3_STAKER_ABI.abi,
    deployer
  );

  await staker.transferDeposit(tokenId, to);
  console.log(`Deposit ${tokenId} transferred to ${to}`);
}

export async function getOwnedRewardsInfo(
  uni: string,
  reward: string,
  rewardDecimals: number,
  owner: string
) {
  const [deployer] = await ethers.getSigners();
  const proxyContract = new ethers.Contract(uni, ProxyAbi.abi, deployer);

  const owned = await proxyContract.rewardsOwned(reward, owner);
  return ethers.formatUnits(owned, rewardDecimals);
}

export async function getDepositInfo(UNIV3_STAKER: string, tokenId: string) {
  const [deployer] = await ethers.getSigners();
  const staker = new ethers.Contract(
    UNIV3_STAKER,
    UNIV3_STAKER_ABI.abi,
    deployer
  );

  const deposit = await staker.deposits(ethers.parseUnits(tokenId, 0));
  return deposit.owner;
}

export async function getRewardInfo(
  tokenId: string,
  key: IncentiveKey,
  uni: string
) {
  const [deployer] = await ethers.getSigners();
  const proxyContract = new ethers.Contract(uni, ProxyAbi.abi, deployer);
  const amount = await proxyContract.getRewardInfo(
    ethers.parseUnits(tokenId, 0),
    key
  );

  console.log(
    `Accumulated reward for tokenId ${tokenId}: ${ethers.formatEther(amount)}`
  );
}

export async function depositAndStake(
  tokenId: string,
  key: IncentiveKey,
  referralSource: string,
  deployer: Signer,
  uni: string
) {
  console.log(
    `Staking tokenId ${tokenId} to incentive:\n${JSON.stringify(
      key
    )}\nwith address ${deployer.address}`
  );

  const proxyContract = new ethers.Contract(uni, ProxyAbi.abi, deployer);
  const nftPositionManagerContract = new ethers.Contract(
    UNIV3_NFT_POSITION_MANAGER,
    UNIV3_NFT_POSITION_MANAGER_ABI,
    deployer
  );

  //check owner
  console.log(
    "Owner before staking of tokenId",
    tokenId,
    ":",
    await nftPositionManagerContract.ownerOf(+tokenId)
  );

  //approve the proxy as spender
  await nftPositionManagerContract.approve(uni, tokenId);
  console.log("Token approved");

  // transfer token to incentive and start owning rewards
  await proxyContract.stake(ethers.parseUnits(tokenId, 0), key, referralSource);
  console.log("Staked");

  console.log(
    "Owner after staking of tokenId",
    tokenId,
    ":",
    await nftPositionManagerContract.ownerOf(+tokenId)
  );
}

export async function getPool(
  uni: string,
  token0: string,
  token1: string,
  fee?: number
) {
  const [deployer] = await ethers.getSigners();
  const proxyContract = new ethers.Contract(uni, ProxyAbi.abi, deployer);

  return await proxyContract.getPool(
    token0,
    token1,
    fee !== undefined ? fee : 100
  );
}

export async function createIncentive(
  t0: string,
  t1: string,
  reward: string,
  amount: string,
  startTime: number,
  endTIme: number,
  uni: string
) {
  const [deployer] = await ethers.getSigners();
  console.log("Creating incentives with", deployer.address);

  const proxyContract = new ethers.Contract(uni, ProxyAbi.abi, deployer);
  const rewardContract = new ethers.Contract(reward, RewardAbi.abi, deployer);

  //approve the proxy
  await rewardContract.approve(uni, ethers.MaxUint256);
  console.log("Proxy contract approved for reward token");

  // create incentive
  await proxyContract.createIncentive(
    t0,
    t1,
    reward,
    ethers.parseEther(amount),
    startTime,
    endTIme,
    await deployer.getAddress()
  );
  console.log("Incentive created");
}

export async function deployV3StakerAndReward(
  factory: string,
  nftpos: string,
  maxLeadTime: number,
  maxTime: number,
  rewardsToMint?: string
) {
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying UniswapV3StakerProxy contract with signer:",
    deployer.address
  );

  const stakerContract = await ethers.getContractFactory(
    "UniswapV3StakerFront"
  );
  const tokenContract = await ethers.getContractFactory("OvaReferral");

  // define max fee for test network
  const block = await deployer.provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const maxFee = baseFee * BigInt(10);
  const defaultTransactionOptions = {
    maxFeePerGas: maxFee
  };

  // deploy the uni proxy contract
  const uni = await stakerContract.deploy(
    deployer.address,
    factory,
    nftpos,
    maxLeadTime,
    maxTime,
    defaultTransactionOptions
  );
  const token = await tokenContract.deploy(
    deployer.address,
    defaultTransactionOptions
  );
  await uni.waitForDeployment();
  await token.waitForDeployment();

  await token.connect(deployer).setMinter(deployer.address);
  await token.connect(deployer).setMinter(await uni.getAddress());

  // mint some tokens if needed
  if (rewardsToMint !== undefined) {
    await token
      .connect(deployer)
      .mint(deployer.address, ethers.parseEther(rewardsToMint));
  }

  console.log("Staker front contract deployed at:", await uni.getAddress());
  console.log("Reward token contract deployed at:", await token.getAddress());

  return { proxy: await uni.getAddress(), reward: await token.getAddress() };
}
