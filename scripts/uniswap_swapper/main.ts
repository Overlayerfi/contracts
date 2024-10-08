import { swap } from "./proxy";

// This test demonstrate how to swap a tokens on UniV3.
swap("3", "1").catch((err) => {
  console.error("Swap failed:", err);
});
