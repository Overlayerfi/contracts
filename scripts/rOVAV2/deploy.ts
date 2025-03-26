import { deploy_rOVAV2 } from "../functions";

const dg = {
  gasLimit: 2000000,
  maxFeePerGas: 2 * 10 ** 9
};
deploy_rOVAV2(dg).then(() => console.log("Completed"));
