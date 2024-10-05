import { ethers } from "hardhat";
import { DAI_ADDRESS, WETH_MAINNET_ADDRESS } from "../addresses";
import { mintPosition } from "../uniswap_liquidity/proxy";
import {
  createIncentive,
  deploy,
  depositAndStake,
  getDepositInfo,
  getPool,
  getRewardInfo,
  recoverDeposit,
  rewardBalance,
  tokenOwner,
  transferDeposit,
  unstake
} from "./proxy";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// This test demonstrate how to stake and unstake UniV3 position into the Staker contract.
// The public Staker contract deployed on eth mainnet is being used.
async function main() {
  const startTime = (await time.latest()) + 60 * 60;
  const endTime = (await time.latest()) + 60 * 60 * 24 * 30 * 12; //~1 year
  const token0 = DAI_ADDRESS;
  const token1 = WETH_MAINNET_ADDRESS;
  const owner = "0x10fc45741bfE5D527c1b83Fe0BD70fC96D7ec30F";

  // Create incentive
  const ret = await deploy();
  await createIncentive(
    token0,
    token1,
    ret.reward,
    "1000",
    startTime,
    endTime,
    ret.proxy
  );

  // Add liquidity position
  const mintResultA = await mintPosition(
    token0,
    token1,
    18,
    18,
    "1000",
    "0.1",
    100,
    "1"
  );
  const mintResultB = await mintPosition(
    token0,
    token1,
    18,
    18,
    "2000",
    "0.2",
    100,
    "1"
  );

  //advance time
  await time.increaseTo(startTime + 60);

  const incentiveKey = {
    rewardToken: ret.reward,
    pool: await getPool(ret.proxy, token0, token1),
    startTime: startTime,
    endTime: endTime,
    refundee: owner
  };
  // Stake tokenId
  await depositAndStake(
    mintResultA.tokenId.toString(),
    incentiveKey,
    ret.proxy
  );
  await depositAndStake(
    mintResultB.tokenId.toString(),
    incentiveKey,
    ret.proxy
  );

  //advance time (1h until the end)
  await time.increaseTo(endTime - 60 * 60);

  // Accrued rewards
  await getRewardInfo(mintResultA.tokenId.toString(), incentiveKey, ret.proxy);
  await getRewardInfo(mintResultB.tokenId.toString(), incentiveKey, ret.proxy);

  // Deposit info
  for (const r of [mintResultA, mintResultB]) {
    const deposit = await getDepositInfo(r.tokenId.toString());
    console.log(`Deposit:\n${deposit}`);
  }

  // Transfer deposit to the proxy account to initiate the unstake procedure
  for (const r of [mintResultA, mintResultB]) {
    await transferDeposit(r.tokenId, ret.proxy);
  }

  // Check new owner
  for (const r of [mintResultA, mintResultB]) {
    const owner = await getDepositInfo(r.tokenId.toString());
    console.log(`New deposit owner ${owner}`);
  }

  // Try to recover the deposits
  for (const r of [mintResultA, mintResultB]) {
    await recoverDeposit(r.tokenId.toString(), ret.proxy);
  }

  const [deployer, recipient] = await ethers.getSigners();
  console.log(`Using as recipient ${recipient.address}`);
  // Transfer deposit to the proxy account to initiate the unstake procedure. Now for real
  for (const r of [mintResultA, mintResultB]) {
    await transferDeposit(r.tokenId, ret.proxy);
    await unstake(
      r.tokenId.toString(),
      incentiveKey,
      ret.proxy,
      ret.reward,
      recipient.address
    );
  }

  // Check reward balance
  const bal = await rewardBalance(ret.reward, recipient.address);
  console.log(`Final reward recipient balance: ${bal}`);
  // Check token owner
  for (const r of [mintResultA, mintResultB]) {
    console.log(
      `Final tokenId ${r.tokenId} owner ${await tokenOwner(
        r.tokenId.toString()
      )}`
    );
  }
}

main().catch((err) => {
  console.error("UniV3 position staking failed:", err);
});
