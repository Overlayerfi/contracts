import { deploy_Liquidity } from "../functions";

deploy_Liquidity("").catch((error) => {
  console.error("Deployment failed ->", error);
});
