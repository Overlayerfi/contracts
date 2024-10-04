import { mintPosition } from "./liquidity";

mintPosition("10", "1").catch((err) => {
  console.error("Mint failed:", err);
});
