import {
  deployUSDO,
  deployStakedUSDO,
  deployStakingRewardsDistributor,
  deployAirdropOBSIReceipt
} from "../functions";

// The input addresses below take in account the we use the same deployer account (signer) for the forked mainnet for local tests.
// Addresses are hence reproducible at every restart of the local node as the signer will have the same nonce
// (if signer does not transact on the forked networked before the pinned block: see hardhat config).

const USDO = "0x72872f101327902fC805637Cccd9A3542ed31e47";
const SUSDO = "0x9E7ef64F17E79366e70C1Fdc01E1A00323e1FCF8";

async function main() {
  try {
    await deployUSDO();
    await deployStakedUSDO(USDO);
    await deployStakingRewardsDistributor(SUSDO, USDO, true);
    await deployAirdropOBSIReceipt(USDO);
  } catch (err) {
    console.error("Batch deployment failed ->", err);
  }
}

main();
