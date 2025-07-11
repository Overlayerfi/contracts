import { deploy_OverlayerWrap } from "../functions";

deploy_OverlayerWrap().catch((err) => {
  console.error("Deployment failed -> " + err);
});
