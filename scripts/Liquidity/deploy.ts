import { deploy_Liquidity } from "../functions";

deploy_Liquidity("", 0).catch((error) => {
  console.error("Deployment failed ->", error);
});
