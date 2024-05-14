import { swap } from "./swap";

swap("100", "50").catch((err) => {
  console.error("Swap failed:", err);
});
