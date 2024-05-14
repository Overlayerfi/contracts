import { deploy_USDO } from "../functions";

deploy_USDO().catch((err) => {
  console.error("Deployment failed -> " + err);
});
