import { AirdropReward_setStakingPools } from "../functions";

AirdropReward_setStakingPools(
  "0x00D15604415907AAE09e5454Ca299f2Ee93fA941",
  ["0xF8FF4fD5f485CE0FDAA0043f1Db283d9CB691A9F", "0xC040135dFad78636013ADb0d437DaA123B6A8f74", "0x0518d5B14A3b1CcE25ae22eAa8099b565b317383"]
).catch((err) => {
  console.error("Operation failed -> " + err);
});
