import { deployUSDO } from "../functions";

deployUSDO().catch((err) => {
  console.error("Deployment failed -> " + err);
});
