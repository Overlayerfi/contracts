import {
  DAI_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS,
  WETH_MAINNET_ADDRESS
} from "../addresses";
import { mintPosition } from "./proxy";

// This test demonstrate how to mint a liquidity position on UniV3.
// If token0 and token1 are changed you have to adapt the ticks values inside the contract too (hardcoded for now as it's not a production contract).
mintPosition(
  DAI_ADDRESS,
  WETH_MAINNET_ADDRESS,
  18,
  18,
  "1000",
  "0.5",
  100,
  "2"
).catch((err) => {
  console.error("Mint failed:", err);
});
