export interface IToken {
  address: string;
  decimals: number;
  description?: string;
  img: string | null;
  name: string;
}

interface ILiquidityInfo {
  tokenA: IToken;
  tokenB?: IToken;
  singleStake: boolean;
  multiplier: string;
  weight: string;
  pid: string;
  reward: IToken;
  apr: string;
  liquidityUsd: string;
  stakedAsset: string;
}

export interface ILiquidity {
  info: ILiquidityInfo;
}
