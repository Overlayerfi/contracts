import { deployUSDx, deployStakedUSDx, deployStakingRewardsDistributor } from "../functions";

// The input addresses below take in account the we use the same deployer account (signer) for the forked mainnet for local tests.
// Addresses are hence reproducible at every restart of the local node as the signer will have the same nonce.

async function main() {
	try {
		await deployUSDx();
		await deployStakedUSDx('0x72872f101327902fC805637Cccd9A3542ed31e47');
		await deployStakingRewardsDistributor('0x9E7ef64F17E79366e70C1Fdc01E1A00323e1FCF8', '0x72872f101327902fC805637Cccd9A3542ed31e47', true);
	} catch(err) {
		console.error("USDx deployment failed ->", err);
	}
}

main();