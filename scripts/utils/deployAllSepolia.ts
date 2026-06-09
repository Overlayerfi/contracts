import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  StakedOverlayerWrap_setCooldownStaking,
  grantRole,
  OverlayerWrap_proposeNewCollateralSpender,
  deploy_OverlayerWrapBacking,
  OverlayerWrap_mint,
  StakedOverlayerWrap_deposit,
  deploy_OverlayerReferral,
  deploy_AirdropSingleStableStake,
  SingleStableStake_setRewardForStakedAssets,
  SingleStableStake_addPool,
  OverlayerReferral_setStakingPools,
  OverlayerReferral_addTrackers,
  Liquidity_updateReferral,
  deploy_Dispatcher
} from "../functions";
import OverlayerWrap_ABI from "../../artifacts/contracts/overlayer/OverlayerWrap.sol/OverlayerWrap.json";
import SOverlayerWrap_ABI from "../../artifacts/contracts/overlayer/StakedOverlayerWrap.sol/StakedOverlayerWrap.json";
import OverlayerWrapBacking_ABI from "../../artifacts/contracts/overlayerbacking/OverlayerBacking.sol/OverlayerWrapBacking.json";
import SINGLE_STABLE_STAKE_ABI from "../../artifacts/contracts/liquidity/SingleStableStake.sol/SingleStableStake.json";
import OVERLAYER_REFERRAL_ABI from "../../artifacts/contracts/overlayer/OverlayerReferral.sol/OverlayerReferral.json";
import { getContractAddress } from "@ethersproject/address";
import {
  USDT_SEPOLIA_ADDRESS,
  AUSDT_SEPOLIA_ADDRESS,
  AAVE_POOL_V3_SEPOLIA_ADDRESS,
  EURS_SEPOLIA_ADDRESS,
  AEURS_SEPOLIA_ADDRESS,
  USDC_SEPOLIA_ADDRESS,
  AUSDC_SEPOLIA_ADDRESS
} from "../addresses";
import { SEPOLIA_TOKEN_DECIMALS } from "../constants";
import { USDT_ABI } from "../abi/USDT_abi";

//########################################## CONFIGURATION ##########################################

const COLLATERAL_ADDRESS = USDC_SEPOLIA_ADDRESS;
const ACOLLATERAL_ADDRESS = AUSDC_SEPOLIA_ADDRESS;
const DECIMALS = SEPOLIA_TOKEN_DECIMALS.USDC;

// Admin & Team Addresses
const AIRDROP_POOLS_REWARD_TOKEN_ADMIN =
  "0x1b4b7eD919416550457d142E54e7f98583E4B018";
const AIRDROP_POOLS_ADMIN = "0x1b4b7eD919416550457d142E54e7f98583E4B018";
const OVA_SEPOLIA_RESERVE_FUND = "0x7bE51020c8c6a9153B3C8688410d201bbbb27fB9";
const OVA_SEPOLIA_TEAM = "0x4b05A19E5b50498fe94d9F7A7c8362f5ACc457b1";

// Mock LP and Signer
const mockLp = "0x1Ac7E198685e53cCc3599e1656E48Dd7E278EbbE";
const signerAddr = "0x1b4b7eD919416550457d142E54e7f98583E4B018";

// Pre-deployed OFT Contracts
const oftOverlayerWrapAddr = "0x9Ea94deD198e296D744FD3bcC5A62259fD8313F5";
const stakedOverlayerWrapAddr = "0x872427c089570357297E452e056bC4648343fE95";

/**
 * Helper function to get current ISO timestamp for logging
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Deploy all contracts for Sepolia testnet
 *
 * Collateral Configuration: Update COLLATERAL_ADDRESS and ACOLLATERAL_ADDRESS at the top
 * to deploy with different collateral tokens (USDT, EURS, USDC, etc.)
 */
async function main() {
  try {
    const admin = await ethers.getSigner(signerAddr);
    console.log(`[${getTimestamp()}] Signer address:`, admin.address);

    // const latestTime: number = Math.floor(new Date().getTime() / 1000);
    // console.log(`[${getTimestamp()}] Starting pools timestamp: ${latestTime}`);

    const defaultTransactionOptions = {
      gasLimit: 2000000
    };

    // 1. Overlayer wrap token and its staked version should be deployed with the oft way
    const overlayerWrapAddr = oftOverlayerWrapAddr;
    const sOverlayerWrapAddr = stakedOverlayerWrapAddr;

    console.log(
      `[${getTimestamp()}] Using deployed OverlayerWrapped: ${oftOverlayerWrapAddr}`
    );
    console.log(
      `[${getTimestamp()}] Using deployed OverlayerWrapped: ${stakedOverlayerWrapAddr}`
    );

    let tx = null;
    let receipt = null;

    // 2. Deploy airdrop points (also referral contract)
    // const overlayerReferralAddress = await deploy_OverlayerReferral(
    //   AIRDROP_POOLS_REWARD_TOKEN_ADMIN,
    //   2
    // );
    // const overlayerReferralContract = new ethers.Contract(
    //   overlayerReferralAddress,
    //   OVERLAYER_REFERRAL_ABI.abi,
    //   admin.provider
    // );

    // 4. Deploy airdrop pools: Single stable stake and curve stable stake (faked with single stable stake)
    // const singleStableStakeAddr = await deploy_AirdropSingleStableStake(
    //   AIRDROP_POOLS_ADMIN,
    //   2
    // );
    // const singleStableStakePremiumAddr = await deploy_AirdropSingleStableStake(
    //   AIRDROP_POOLS_ADMIN,
    //   2
    // );
    // const curveStableStakeCrvAddr = await deploy_AirdropSingleStableStake(
    //   AIRDROP_POOLS_ADMIN,
    //   2
    // );
    // const singleStableStakeContract = new ethers.Contract(
    //   singleStableStakeAddr,
    //   SINGLE_STABLE_STAKE_ABI.abi,
    //   admin.provider
    // );
    // const singleStableStakePremiumContract = new ethers.Contract(
    //   singleStableStakePremiumAddr,
    //   SINGLE_STABLE_STAKE_ABI.abi,
    //   admin.provider
    // );
    // const curveStableStakeCrvContract = new ethers.Contract(
    //   curveStableStakeCrvAddr,
    //   SINGLE_STABLE_STAKE_ABI.abi,
    //   admin.provider
    // );

    // 5. Set airdrop reward minters
    // tx = await (overlayerReferralContract.connect(admin) as Contract).setMinter(
    //   singleStableStakeAddr,
    //   defaultTransactionOptions
    // );
    // let receipt = await tx.wait();
    // console.log(
    //   `[${getTimestamp()}] Airdrop::reward minter set to:`,
    //   singleStableStakeAddr,
    //   "hash =",
    //   tx.hash
    // );
    // tx = await (overlayerReferralContract.connect(admin) as Contract).setMinter(
    //   singleStableStakePremiumAddr,
    //   defaultTransactionOptions
    // );
    // receipt = await tx.wait();
    // console.log(
    //   `[${getTimestamp()}] Airdrop::reward minter set to:`,
    //   singleStableStakePremiumAddr,
    //   "hash =",
    //   tx.hash
    // );
    // tx = await (overlayerReferralContract.connect(admin) as Contract).setMinter(
    //   curveStableStakeCrvAddr,
    //   defaultTransactionOptions
    // );
    // receipt = await tx.wait();
    // console.log(
    //   `[${getTimestamp()}] Airdrop::reward minter set to:`,
    //   curveStableStakeCrvAddr,
    //   "hash =",
    //   tx.hash
    // );

    // 6. Set reward assets and pools inside Liquidity pools
    // await SingleStableStake_setRewardForStakedAssets(
    //   curveStableStakeCrvContract,
    //   admin,
    //   overlayerReferralAddress,
    //   200,
    //   1,
    //   2
    // );
    // await SingleStableStake_setRewardForStakedAssets(
    //   singleStableStakeContract,
    //   admin,
    //   overlayerReferralAddress,
    //   500,
    //   1,
    //   2
    // );
    // await SingleStableStake_setRewardForStakedAssets(
    //   singleStableStakePremiumContract,
    //   admin,
    //   overlayerReferralAddress,
    //   1000,
    //   1,
    //   2
    // );
    // Mock LP token with predeployed address (represents Collateral-OverlayerWrap LP)
    // const endTimeStamp = latestTime + 60 * 60 * 24 * 30 * 12; //12 months
    // console.log(`[${getTimestamp()}] Ending pools timestamp: ${endTimeStamp}`);
    // await SingleStableStake_addPool(
    //   curveStableStakeCrvContract,
    //   admin,
    //   mockLp,
    //   overlayerReferralAddress,
    //   1,
    //   endTimeStamp,
    //   false,
    //   true,
    //   2
    // );
    // await SingleStableStake_addPool(
    //   singleStableStakeContract,
    //   admin,
    //   overlayerWrapAddr,
    //   overlayerReferralAddress,
    //   1,
    //   endTimeStamp,
    //   false,
    //   true,
    //   2
    // );
    // await SingleStableStake_addPool(
    //   singleStableStakePremiumContract,
    //   admin,
    //   overlayerWrapAddr,
    //   overlayerReferralAddress,
    //   1,
    //   endTimeStamp,
    //   true,
    //   true,
    //   2
    // );

    // 7. Deploy ova dispatcher
    const dispatcherAddress = await deploy_Dispatcher(
      admin.address,
      OVA_SEPOLIA_TEAM,
      OVA_SEPOLIA_RESERVE_FUND,
      OVA_SEPOLIA_RESERVE_FUND,
      overlayerWrapAddr
    );

    // 8. Remove cool down from Staked OverlayerWrap (deprecated)
    // await StakedOverlayerWrap_setCooldownStaking(sOverlayerWrapAddr, 0); // None

    // 9. Grant collateral manager role in OverlayerWrap
    await grantRole(
      overlayerWrapAddr,
      OverlayerWrap_ABI.abi,
      "COLLATERAL_MANAGER_ROLE",
      admin.address,
      2
    );

    // 10. Deploy and propose the OverlayerWrap collateral spender (the backing contract)
    const OverlayerWrapBackingNonce = (await admin.getNonce()) + 1;
    const futureAddress = getContractAddress({
      from: admin.address,
      nonce: OverlayerWrapBackingNonce
    });
    await OverlayerWrap_proposeNewCollateralSpender(
      overlayerWrapAddr,
      futureAddress
    );
    const overlayerWrapBackingAddr = await deploy_OverlayerWrapBacking(
      admin.address,
      dispatcherAddress,
      overlayerWrapAddr,
      sOverlayerWrapAddr,
      AAVE_POOL_V3_SEPOLIA_ADDRESS,
      COLLATERAL_ADDRESS,
      ACOLLATERAL_ADDRESS
    );

    if (futureAddress !== overlayerWrapBackingAddr) {
      throw new Error(
        "The predicted OverlayerWrapBacking address is not valid"
      );
    }

    const overlayerWrapBackingContract = new ethers.Contract(
      overlayerWrapBackingAddr,
      OverlayerWrapBacking_ABI.abi,
      admin
    );
    tx = await (
      overlayerWrapBackingContract.connect(admin) as Contract
    ).acceptCollateralSpender(defaultTransactionOptions);
    receipt = await tx.wait();

    // 11. Grant to the backing contract the rewarder role
    await grantRole(
      sOverlayerWrapAddr,
      SOverlayerWrap_ABI.abi,
      "REWARDER_ROLE",
      overlayerWrapBackingAddr,
      2
    );

    // 12. Mint and stake initial OverlayerWrap with configured collateral
    const collateralContract = new ethers.Contract(
      COLLATERAL_ADDRESS,
      USDT_ABI,
      admin
    );
    tx = await (collateralContract.connect(admin) as Contract).approve(
      overlayerWrapAddr,
      ethers.MaxUint256,
      defaultTransactionOptions
    );
    console.log(
      `[${getTimestamp()}] Approved collateral to OverlayerWrap hash = ${
        tx.hash
      }`
    );

    const order = {
      benefactor: admin.address,
      beneficiary: admin.address,
      collateral: COLLATERAL_ADDRESS,
      collateralAmount: ethers.parseUnits("1", DECIMALS),
      overlayerWrapAmount: ethers.parseEther("1")
    };
    await OverlayerWrap_mint(overlayerWrapAddr, order);
    const overlayerWrapContract = new ethers.Contract(
      overlayerWrapAddr,
      OverlayerWrap_ABI.abi,
      admin
    );
    tx = await (overlayerWrapContract.connect(admin) as Contract).approve(
      sOverlayerWrapAddr,
      ethers.MaxUint256,
      defaultTransactionOptions
    );
    receipt = await tx.wait();
    console.log(
      `[${getTimestamp()}] Approved deployer OverlayerWrap to StakedOverlayerWrap hash = ${
        tx.hash
      }`
    );
    await StakedOverlayerWrap_deposit(sOverlayerWrapAddr, "1", admin.address);

    // 13. Set staking pools inside the referral contract
    // await OverlayerReferral_setStakingPools(overlayerReferralAddress, [
    //   curveStableStakeCrvAddr,
    //   singleStableStakePremiumAddr,
    //   singleStableStakeAddr
    // ]);

    // 14. Add points trackers
    // await OverlayerReferral_addTrackers(overlayerReferralAddress, [
    //   curveStableStakeCrvAddr,
    //   singleStableStakePremiumAddr,
    //   singleStableStakeAddr
    // ]);

    // 15. Update referral contract address
    // await Liquidity_updateReferral(curveStableStakeCrvAddr, overlayerReferralAddress);
    // await Liquidity_updateReferral(singleStableStakeAddr, overlayerReferralAddress);
    // await Liquidity_updateReferral(
    //   singleStableStakePremiumAddr,
    //   overlayerReferralAddress
    // );
  } catch (err) {
    console.error(`[${getTimestamp()}] Batch deployment failed ->`, err);
  }
}

main();
