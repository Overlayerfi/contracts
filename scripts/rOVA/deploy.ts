import { deploy_rOVA } from "../functions";

const dg = {
  gasLimit: 2000000,
  maxFeePerGas: 10 * 10 ** 9
};
deploy_rOVA(dg).then(() => console.log("Completed"));
