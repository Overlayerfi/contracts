import { deployLiquidity } from "../functions";

deployLiquidity('', 0).catch((error) => {
  console.error("Deployment failed ->", error);
});
