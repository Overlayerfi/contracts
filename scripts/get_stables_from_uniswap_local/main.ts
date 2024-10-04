import { swap } from "./swap";

swap("3", "1").catch((err) => {
  console.error("Swap failed:", err);
});
