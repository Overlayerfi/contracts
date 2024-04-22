import { deployStakingRewardsDistributor } from "../functions";


deployStakingRewardsDistributor("0x9E7ef64F17E79366e70C1Fdc01E1A00323e1FCF8", "0x72872f101327902fC805637Cccd9A3542ed31e47", true).catch((err) => {
	console.error("Deployment failed ->", err);
})