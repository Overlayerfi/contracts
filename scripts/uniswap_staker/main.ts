import { DAI_ADDRESS, WETH_MAINNET_ADDRESS } from "../addresses";
import { mintPosition } from "../uniswap_liquidity/proxy";
import {
  createIncentive,
  deploy,
  depositAndStake,
  getPool,
  getRewardInfo,
  IncentiveKey
} from "./proxy";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

async function main() {
  const startTime = (await time.latest()) + 60 * 60;
  const endTime = (await time.latest()) + 60 * 60 * 24 * 30 * 12; //~1 year
  const token0 = DAI_ADDRESS;
  const token1 = WETH_MAINNET_ADDRESS;

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

  const key = {
    rewardToken: ret.reward,
    pool: await getPool(ret.proxy, token0, token1),
    startTime: startTime,
    endTime: endTime,
    refundee: "0x10fc45741bfE5D527c1b83Fe0BD70fC96D7ec30F"
  };
  // Stake tokenId
  await depositAndStake(mintResultA.tokenId.toString(), key, ret.proxy);
  await depositAndStake(mintResultB.tokenId.toString(), key, ret.proxy);

  //advance time (1h until the end)
  await time.increaseTo(endTime - 60 * 60);

  // Accrued rewards
  await getRewardInfo(mintResultA.tokenId.toString(), key, ret.proxy);
  await getRewardInfo(mintResultB.tokenId.toString(), key, ret.proxy);
}

main().catch((err) => {
  console.error("UniV3 position staking failed:", err);
});
