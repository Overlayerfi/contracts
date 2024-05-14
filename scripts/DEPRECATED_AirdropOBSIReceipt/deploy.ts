import { deploy_AirdropOBSIReceipt } from "../functions";

deploy_AirdropOBSIReceipt("0x72872f101327902fC805637Cccd9A3542ed31e47").catch(
  (err) => {
    console.error("Deployment failed -> " + err);
  }
);
