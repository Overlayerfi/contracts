import { ethers } from "hardhat";

/**
 * Helper function to get current ISO timestamp for logging
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Generic ERC20 approval script
 * 
 * Approves a spender to spend tokens on behalf of the signer
 * 
 * Usage:
 * - Update TOKEN_ADDRESS, SPENDER_ADDRESS, and AMOUNT below
 * - Run: npx hardhat run scripts/utils/approveERC20.ts --network sepolia
 */

//########################################## CONFIGURATION ##########################################

// Token to approve (e.g., USDT, EURS, etc.)
const TOKEN_ADDRESS = "0x6d906e526a4e2Ca02097BA9d0caA3c382F52278E"; // EURS Sepolia

// Address that will be approved to spend tokens
const SPENDER_ADDRESS = "0x919CbEEce48DE3f3FA1Ec8837d461cB7Dd8F97a6"; // OverlayerWrap address

// Amount to approve
// Use ethers.MaxUint256 for unlimited approval
// Or use ethers.parseUnits("100", decimals) for specific amount
const AMOUNT = ethers.MaxUint256;

// Optional: Signer address (leave empty to use default signer)
const SIGNER_ADDRESS = ""; // Empty = use first signer from hardhat config

//########################################## SCRIPT ##########################################

async function main() {
  try {
    console.log(`[${getTimestamp()}] Starting ERC20 approval...`);
    
    // Get signer
    const signer = SIGNER_ADDRESS 
      ? await ethers.getSigner(SIGNER_ADDRESS)
      : (await ethers.getSigners())[0];
    
    console.log(`[${getTimestamp()}] Signer address:`, signer.address);
    console.log(`[${getTimestamp()}] Token address:`, TOKEN_ADDRESS);
    console.log(`[${getTimestamp()}] Spender address:`, SPENDER_ADDRESS);

    // Minimal ERC20 ABI for approve function
    const ERC20_ABI = [
      "function approve(address spender, uint256 amount) returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)"
    ];

    // Create contract instance
    const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer);

    // Get token info
    const symbol = await token.symbol();
    const decimals = await token.decimals();
    console.log(`[${getTimestamp()}] Token symbol:`, symbol);
    console.log(`[${getTimestamp()}] Token decimals:`, decimals);

    // Check current allowance
    const currentAllowance = await token.allowance(signer.address, SPENDER_ADDRESS);
    console.log(
      `[${getTimestamp()}] Current allowance:`,
      ethers.formatUnits(currentAllowance, decimals)
    );

    const amountDisplay = AMOUNT === ethers.MaxUint256 
      ? "Unlimited (MaxUint256)" 
      : ethers.formatUnits(AMOUNT, decimals);
    console.log(`[${getTimestamp()}] Approving amount:`, amountDisplay);

    console.log(`[${getTimestamp()}] Sending approval transaction...`);
    const tx = await token.approve(SPENDER_ADDRESS, AMOUNT, {
      gasLimit: 100000
    });

    console.log(`[${getTimestamp()}] Transaction hash:`, tx.hash);
    console.log(`[${getTimestamp()}] Waiting for confirmation...`);

    const receipt = await tx.wait();
    
    console.log(`[${getTimestamp()}] Transaction confirmed!`);
    console.log(`[${getTimestamp()}] Block number:`, receipt.blockNumber);
    console.log(`[${getTimestamp()}] Gas used:`, receipt.gasUsed.toString());

    const newAllowance = await token.allowance(signer.address, SPENDER_ADDRESS);
    const newAllowanceDisplay = newAllowance === ethers.MaxUint256
      ? "Unlimited (MaxUint256)"
      : ethers.formatUnits(newAllowance, decimals);
    console.log(`[${getTimestamp()}] New allowance:`, newAllowanceDisplay);

    console.log(`[${getTimestamp()}] Approval successful!`);

  } catch (error: any) {
    console.error(`[${getTimestamp()}] Approval failed:`, error.message);
    if (error.reason) {
      console.error(`[${getTimestamp()}] Reason:`, error.reason);
    }
    process.exit(1);
  }
}

// Execute script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`[${getTimestamp()}] Unhandled error:`, error);
    process.exit(1);
  });

