import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  deploy_OverlayerWrap,
  deploy_StakedOverlayerWrap,
  StakedOverlayerWrap_setCooldownStaking,
  grantRole,
  OverlayerWrap_proposeNewCollateralSpender,
  deploy_OverlayerWrapBacking,
  OverlayerWrap_mint,
  StakedOverlayerWrap_deposit,
  deploy_AirdropReward,
  deploy_AirdropSingleStableStake,
  SingleStableStake_setRewardForStakedAssets,
  SingleStableStake_addPool,
  AirdropReward_setStakingPools,
  AirdropReward_addTrackers,
  Liquidity_updateReferral,
  deploy_Dispatcher
} from "../functions";
import OverlayerWrap_ABI from "../../artifacts/contracts/overlayer/OverlayerWrap.sol/OverlayerWrap.json";
import SOverlayerWrap_ABI from "../../artifacts/contracts/overlayer/StakedOverlayerWrapFront.sol/StakedOverlayerWrapFront.json";
import SINGLE_STABLE_STAKE_ABI from "../../artifacts/contracts/liquidity/SingleStableStake.sol/SingleStableStake.json";
import OVA_REFERRAL_ABI from "../../artifacts/contracts/overlayer/OvaReferral.sol/OvaReferral.json";
import { getContractAddress } from "@ethersproject/address";
import { USDT_SEPOLIA_ADDRESS, AUSDT_SEPOLIA_ADDRESS } from "../addresses";

const AIRDROP_POOLS_REWARD_TOKEN_ADMIN =
  "0x1b4b7eD919416550457d142E54e7f98583E4B018";
const AIRDROP_POOLS_ADMIN = "0x1b4b7eD919416550457d142E54e7f98583E4B018";
const OVA_SEPOLIA_RESERVE_FUND = "0x7bE51020c8c6a9153B3C8688410d201bbbb27fB9";
const OVA_SEPOLIA_TEAM = "0x4b05A19E5b50498fe94d9F7A7c8362f5ACc457b1";

const mockLp = "0x1Ac7E198685e53cCc3599e1656E48Dd7E278EbbE";
const signerAddr = "0x1b4b7eD919416550457d142E54e7f98583E4B018";

// Curve pools are mocked by using single token pools
async function main() {
  try {
    const admin = await ethers.getSigner(signerAddr);
    console.log("[main] Signer address:", admin.address);

    const latestTime: number = Math.floor(new Date().getTime() / 1000);
    console.log(`[main] Starting pools timestamp: ${latestTime}`);

    const defaultTransactionOptions = {
      gasLimit: 2000000
    };

    // 1. Deploy USDO
    const overlayerWrapAddr = await deploy_OverlayerWrap(
      USDT_SEPOLIA_ADDRESS,
      AUSDT_SEPOLIA_ADDRESS,
      2
    );

    // 2. Deploy sUSDO
    const sOverlayerWrapAddr = await deploy_StakedOverlayerWrap(
      overlayerWrapAddr,
      2
    );

    // 3. Deploy airdrop points (also referral contract)
    const ovaReferralAddress = await deploy_AirdropReward(
      AIRDROP_POOLS_REWARD_TOKEN_ADMIN,
      2
    );
    const ovaReferralContract = new ethers.Contract(
      ovaReferralAddress,
      OVA_REFERRAL_ABI.abi,
      admin.provider
    );

    // 4. Deploy airdrop pools: Single stable stake and curve stable stake (faked with single stable stake)
    const singleStableStakeAddr = await deploy_AirdropSingleStableStake(
      AIRDROP_POOLS_ADMIN,
      2
    );
    const singleStableStakePremiumAddr = await deploy_AirdropSingleStableStake(
      AIRDROP_POOLS_ADMIN,
      2
    );
    const curveStableStakeCrvAddr = await deploy_AirdropSingleStableStake(
      AIRDROP_POOLS_ADMIN,
      2
    );
    const singleStableStakeContract = new ethers.Contract(
      singleStableStakeAddr,
      SINGLE_STABLE_STAKE_ABI.abi,
      admin.provider
    );
    const singleStableStakePremiumContract = new ethers.Contract(
      singleStableStakePremiumAddr,
      SINGLE_STABLE_STAKE_ABI.abi,
      admin.provider
    );
    const curveStableStakeCrvContract = new ethers.Contract(
      curveStableStakeCrvAddr,
      SINGLE_STABLE_STAKE_ABI.abi,
      admin.provider
    );

    // 5. Set airdrop reward minters
    let tx = await (ovaReferralContract.connect(admin) as Contract).setMinter(
      singleStableStakeAddr,
      defaultTransactionOptions
    );
    let receipt = await tx.wait();
    console.log(
      "[main] Airdrop::reward minter set to:",
      singleStableStakeAddr,
      "hash =",
      tx.hash
    );
    tx = await (ovaReferralContract.connect(admin) as Contract).setMinter(
      singleStableStakePremiumAddr,
      defaultTransactionOptions
    );
    receipt = await tx.wait();
    console.log(
      "[main] Airdrop::reward minter set to:",
      singleStableStakePremiumAddr,
      "hash =",
      tx.hash
    );
    tx = await (ovaReferralContract.connect(admin) as Contract).setMinter(
      curveStableStakeCrvAddr,
      defaultTransactionOptions
    );
    receipt = await tx.wait();
    console.log(
      "[main] Airdrop::reward minter set to:",
      curveStableStakeCrvAddr,
      "hash =",
      tx.hash
    );

    // 6. Set reward assets and pools inside Liquidity pools
    await SingleStableStake_setRewardForStakedAssets(
      curveStableStakeCrvContract,
      admin,
      ovaReferralAddress,
      200,
      1,
      2
    );
    await SingleStableStake_setRewardForStakedAssets(
      singleStableStakeContract,
      admin,
      ovaReferralAddress,
      500,
      1,
      2
    );
    await SingleStableStake_setRewardForStakedAssets(
      singleStableStakePremiumContract,
      admin,
      ovaReferralAddress,
      1000,
      1,
      2
    );
    // Fake USDT-USDT+ LP with predeployed token
    const endTimeStamp = latestTime + 60 * 60 * 24 * 30 * 12; //12 months
    console.log(`[main] Ending pools timestamp: ${endTimeStamp}`);
    await SingleStableStake_addPool(
      curveStableStakeCrvContract,
      admin,
      mockLp,
      ovaReferralAddress,
      1,
      endTimeStamp,
      false,
      true,
      2
    );
    await SingleStableStake_addPool(
      singleStableStakeContract,
      admin,
      overlayerWrapAddr,
      ovaReferralAddress,
      1,
      endTimeStamp,
      false,
      true,
      2
    );
    await SingleStableStake_addPool(
      singleStableStakePremiumContract,
      admin,
      overlayerWrapAddr,
      ovaReferralAddress,
      1,
      endTimeStamp,
      true,
      true,
      2
    );

    // 7. Deploy ova dispatcher
    const dispatcherAddress = await deploy_Dispatcher(
      admin.address,
      OVA_SEPOLIA_TEAM,
      OVA_SEPOLIA_RESERVE_FUND,
      OVA_SEPOLIA_RESERVE_FUND,
      overlayerWrapAddr
    );

    // 8. Remove cool down from sUSDO
    await StakedOverlayerWrap_setCooldownStaking(sOverlayerWrapAddr, 0); // None

    // 9. Grant role in USDO
    await grantRole(
      overlayerWrapAddr,
      OverlayerWrap_ABI.abi,
      "COLLATERAL_MANAGER_ROLE",
      admin.address,
      2
    );

    // 10. Deploy and propose the USDO collateral spender (the backing contract)
    const USDOBackingNonce = (await admin.getNonce()) + 1;
    const futureAddress = getContractAddress({
      from: admin.address,
      nonce: USDOBackingNonce
    });
    await OverlayerWrap_proposeNewCollateralSpender(
      overlayerWrapAddr,
      futureAddress
    );
    const usdobackingAddr = await deploy_OverlayerWrapBacking(
      admin.address,
      dispatcherAddress,
      overlayerWrapAddr,
      sOverlayerWrapAddr
    );

    if (futureAddress !== usdobackingAddr) {
      throw new Error("The predicted USDOBacking address is not valid");
    }

    // 11. Grant to the backing contract the rewarder role
    await grantRole(
      sOverlayerWrapAddr,
      SOverlayerWrap_ABI.abi,
      "REWARDER_ROLE",
      usdobackingAddr,
      2
    );

    // const usdtContract = new ethers.Contract(
    //   USDT_SEPOLIA_ADDRESS,
    //   USDT_ABI,
    //   admin
    // );
    // tx = await (usdtContract.connect(admin) as Contract).approve(
    //   overlayerWrapAddr,
    //   ethers.MaxUint256,
    //   defaultTransactionOptions
    // );

    // 12. Mint and stake initial USDO
    const order = {
      benefactor: admin.address,
      beneficiary: admin.address,
      collateral: USDT_SEPOLIA_ADDRESS,
      collateralAmount: ethers.parseUnits("1", 6),
      overlayerWrapAmount: ethers.parseEther("1")
    };
    await OverlayerWrap_mint(overlayerWrapAddr, order);
    const usdoContract = new ethers.Contract(
      overlayerWrapAddr,
      OverlayerWrap_ABI.abi,
      admin
    );
    tx = await (usdoContract.connect(admin) as Contract).approve(
      sOverlayerWrapAddr,
      ethers.MaxUint256,
      defaultTransactionOptions
    );
    receipt = await tx.wait();
    console.log(`[main] Approved deployer USDO to sUSDO hash = ${tx.hash}`);
    await StakedOverlayerWrap_deposit(sOverlayerWrapAddr, "1", admin.address);

    // 13. Set staking pools inside the referral contract
    await AirdropReward_setStakingPools(ovaReferralAddress, [
      curveStableStakeCrvAddr,
      singleStableStakePremiumAddr,
      singleStableStakeAddr
    ]);

    // 14. Add points trackers
    await AirdropReward_addTrackers(ovaReferralAddress, [
      curveStableStakeCrvAddr,
      singleStableStakePremiumAddr,
      singleStableStakeAddr
    ]);

    // 15. Update referral contract address
    await Liquidity_updateReferral(curveStableStakeCrvAddr, ovaReferralAddress);
    await Liquidity_updateReferral(singleStableStakeAddr, ovaReferralAddress);
    await Liquidity_updateReferral(
      singleStableStakePremiumAddr,
      ovaReferralAddress
    );
  } catch (err) {
    console.error("[main] Batch deployment failed ->", err);
  }
}

main();
