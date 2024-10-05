import {
  DAI_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS,
  WETH_MAINNET_ADDRESS
} from "../addresses";
import { mintPosition } from "./proxy";

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
