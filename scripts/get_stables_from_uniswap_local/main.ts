import { swap } from "./swap";

swap("10", "5").catch((err) => {
  console.error("Swap failed:", err);
});
