import { ethers } from "hardhat";
import ProxyAbi from "../../artifacts/contracts/uniswap/UniswapV3StakerProxy.sol/UniswapV3StakerProxy.json";
import RewardAbi from "../../artifacts/contracts/mock_ERC20/FixedSupplyERC20.sol/FixedSupplyERC20.json";
import { UNIV3_NFT_POSITION_MANAGER, UNIV3_STAKER } from "../addresses";
import { UNIV3_NFT_POSITION_MANAGER_ABI } from "../abi/UNIV3_NFT_POSITION_MANAGER";

export interface IncentiveKey {
  rewardToken: string;
  pool: string;
  startTime: number;
  endTime: number;
  refundee: string;
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
  uni: string
) {
  const [deployer] = await ethers.getSigners();
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
    "Owner of tokenId",
    tokenId,
    ":",
    await nftPositionManagerContract.ownerOf(+tokenId)
  );

  //approve the token
  await nftPositionManagerContract.approve(UNIV3_STAKER, tokenId);
  await nftPositionManagerContract.approve(uni, tokenId);
  console.log("Token approved");

  // transfer token to incentive and start owning rewards
  await proxyContract.stake(ethers.parseUnits(tokenId, 0), key);
  console.log("Staked");
}

export async function getPool(uni: string, token0: string, token1: string) {
  const [deployer] = await ethers.getSigners();
  const proxyContract = new ethers.Contract(uni, ProxyAbi.abi, deployer);

  return await proxyContract.getPool(token0, token1);
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

export async function deploy() {
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying UniswapV3StakerProxy contract with signer:",
    deployer.address
  );

  const stakerContract = await ethers.getContractFactory(
    "UniswapV3StakerProxy"
  );
  const tokenContract = await ethers.getContractFactory("FixedSupplyERC20");

  // define max fee for test network
  const block = await deployer.provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const maxFee = baseFee * BigInt(10);
  const defaultTransactionOptions = {
    maxFeePerGas: maxFee
  };

  // deploy the uni proxy contract
  const uni = await stakerContract.deploy(defaultTransactionOptions);
  const token = await tokenContract.deploy(
    1000,
    "TEST",
    "TEST",
    defaultTransactionOptions
  );
  await uni.waitForDeployment();
  await token.waitForDeployment();
  console.log("Proxy contract deployed at:", await uni.getAddress());
  console.log("Reward token contract deployed at:", await token.getAddress());

  return { proxy: await uni.getAddress(), reward: await token.getAddress() };
}
