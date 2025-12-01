import { StakedOverlayerWrap_deposit } from "../functions";

/**
 * Standalone script to deposit OverlayerWrap tokens into StakedOverlayerWrap
 *
 * Usage: npx hardhat run scripts/utils/depositToStakedOverlayerWrap.ts --network sepolia
 */

//########################################## CONFIGURATION ##########################################

// StakedOverlayerWrap contract address
const STAKED_OVERLAYER_WRAP_ADDRESS =
  "0x979B46fDdC877b25B5262c1b8C93E4c20525A9Ca";

// Amount to deposit (in ether units, e.g., "1" = 1 token)
const AMOUNT = "1";

// Recipient address (who receives the staked tokens)
const RECIPIENT_ADDRESS = "0x1b4b7eD919416550457d142E54e7f98583E4B018";

//########################################## SCRIPT ##########################################

async function main() {
  await StakedOverlayerWrap_deposit(
    STAKED_OVERLAYER_WRAP_ADDRESS,
    AMOUNT,
    RECIPIENT_ADDRESS
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deposit failed:", error);
    process.exit(1);
  });
