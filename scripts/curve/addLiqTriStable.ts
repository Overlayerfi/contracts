import { ethers } from "hardhat";

export async function addLiquidityStable(
  curve: any, //an ethers contract
  pool: string,
  lp: string,
  token0: string,
  token1: string,
  decimals0: number,
  decimals1: number,
  amount0: string,
  amount1: string
) {
  for (const a of [pool, lp, token0, token1]) {
    if (!ethers.isAddress(a)) {
      throw new Error(a + " is not an address");
    }
  }

  await curve.addStableSwap(
    pool,
    lp,
    token0,
    token1,
    ethers.parseUnits(amount0, decimals0),
    ethers.parseUnits(amount1, decimals1)
  );
}

export async function addLiquidityTriStable(
  curve: any, //an ethers contract
  pool: string,
  lp: string,
  token0: string,
  token1: string,
  token2: string,
  decimals0: number,
  decimals1: number,
  decimals2: number,
  amount0: string,
  amount1: string,
  amount2: string
) {
  for (const a of [pool, lp, token0, token1]) {
    if (!ethers.isAddress(a)) {
      throw new Error(a + " is not an address");
    }
  }

  await curve.addTriStableSwap(
    pool,
    lp,
    token0,
    token1,
    token2,
    ethers.parseUnits(amount0, decimals0),
    ethers.parseUnits(amount1, decimals1),
    ethers.parseUnits(amount2, decimals2)
  );
}
