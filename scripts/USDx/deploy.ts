import { deployUSDx } from "../functions";

deployUSDx().catch((err) => {
	console.error("Deployment failed -> " + err);
})
