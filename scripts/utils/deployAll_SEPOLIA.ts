import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  deploy_USDO,
  deploy_StakedUSDO,
  StakedUSDO_setCooldownStaking,
  grantRole,
  USDO_proposeNewCollateralSpender,
  deploy_USDOBacking,
  USDO_mint,
  StakedUSDO_deposit,
  deploy_AirdropReward,
  deploy_AirdropPoolCurveStableStake,
  deploy_AirdropSingleStableStake,
  CurveStableStake_setRewardForStakedAssets,
  SingleStableStake_setRewardForStakedAssets,
  CurveStableStake_addWithNumCoinsAndPool,
  SingleStableStake_addPool,
  AirdropReward_setStakingPools,
  AirdropReward_addTrackers,
  Liquidity_updateReferral
} from "../functions";
import USDO_ABI from "../../artifacts/contracts/token/USDO.sol/USDO.json";
import SUSDO_ABI from "../../artifacts/contracts/token/StakedUSDOFront.sol/StakedUSDOFront.json";
import CURVE_STABLE_STAKE_ABI from "../../artifacts/contracts/liquidity/CurveStableStake.sol/CurveStableStake.json";
import SINGLE_STABLE_STAKE_ABI from "../../artifacts/contracts/liquidity/SingleStableStake.sol/SingleStableStake.json";
import OVA_REFERRAL_ABI from "../../artifacts/contracts/token/OvaReferral.sol/OvaReferral.json";
import { getContractAddress } from "@ethersproject/address";
import { AUSDC_SEPOLIA_ADDRESS, AUSDT_SEPOLIA_ADDRESS, USDC_SEPOLIA_ADDRESS, USDT_SEPOLIA_ADDRESS } from "../addresses";
//import {
//  CURVE_DAI_USDC_USDT_LP,
//  CURVE_DAI_USDC_USDT_POOL,
//  DAI_ADDRESS,
//  USDC_ADDRESS,
//  USDT_ADDRESS
//} from "../addresses";

const AIRDROP_POOLS_REWARD_TOKEN_ADMIN =
  "0xE6379d6EB7573734eD198cbc98D37769c40b4126";
const AIRDROP_POOLS_ADMIN = "0xE6379d6EB7573734eD198cbc98D37769c40b4126";

// Curve pools are mocked by using single token pools
// TODO: Restore Curve staking pools on mainnet
async function main() {
  try {
    const admin = await ethers.getSigner(
      "0xE6379d6EB7573734eD198cbc98D37769c40b4126"
    );
    const treasuryAddr = "0xE14e881B37042FcaB208918feA435aE520C4Dce4";
    console.log("Signer address:", admin.address);
    console.log("Treasury address:", treasuryAddr);

    const latestTime: number = Math.floor(new Date().getTime() / 1000);
    console.log(`Starting pools timestamp: ${latestTime}`);

    const defaultTransactionOptions = {
      gasLimit: 10000000
    };

    // 0. Retrieve mock tokens
    // TODO: remove on mainnet
    const fakeUsdcUsdo = "0xc0B8D9721a97f10863029510A0989dBaF0661947";
    const fakeUsdtUsdo = "0xf37D303B57b5feD5f1171aC02A411Ecc5cd7F343";

    // 1. Deploy USDO
    const usdoAddr = await deploy_USDO(USDC_SEPOLIA_ADDRESS, 6, USDT_SEPOLIA_ADDRESS, 6, AUSDC_SEPOLIA_ADDRESS, 6, AUSDT_SEPOLIA_ADDRESS, 6, true, 2);

    // 2. Deploy sUSDO
    const susdoAddr = await deploy_StakedUSDO(usdoAddr, 2);

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

    // 4. Deploy airdrop pool: Curve stable stake
    //const curveStableStakeAddr = await deploy_AirdropPoolCurveStableStake(
    //  AIRDROP_POOLS_ADMIN
    //);
    //const curveStableStakeContract = new ethers.Contract(
    //  curveStableStakeAddr,
    //  CURVE_STABLE_STAKE_ABI.abi,
    //  admin.provider
    //);

    // 5. Deploy airdrop pools: Single stable stake
    const singleStableStakeAddr = await deploy_AirdropSingleStableStake(
      AIRDROP_POOLS_ADMIN,
      2
    );
    const singleStableStakePremiumAddr = await deploy_AirdropSingleStableStake(
      AIRDROP_POOLS_ADMIN,
      2
    );
    // TODO: remove on mainnet
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
    // TODO: remove on mainnet
    const curveStableStakeCrvContract = new ethers.Contract(
      curveStableStakeCrvAddr,
      SINGLE_STABLE_STAKE_ABI.abi,
      admin.provider
    );

    // 6. Set airdrop reward minters
    //await (ovaReferralContract.connect(admin) as Contract).setMinter(
    //  curveStableStakeAddr
    //);
    let tx = await (ovaReferralContract.connect(admin) as Contract).setMinter(
      singleStableStakeAddr,
      defaultTransactionOptions
    );
    let receipt = await tx.wait();
    console.log(
      "Airdrop::reward minter set to:",
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
      "Airdrop::reward minter set to:",
      singleStableStakePremiumAddr,
      "hash =",
      tx.hash
    );
    // TODO: remove on mainnet
    tx = await (ovaReferralContract.connect(admin) as Contract).setMinter(
      curveStableStakeCrvAddr,
      defaultTransactionOptions
    );
    receipt = await tx.wait();
    console.log(
      "Airdrop::reward minter set to:",
      curveStableStakeCrvAddr,
      "hash =",
      tx.hash
    );

    // 7. Set reward assets and pools inside Liquidity pools
    // See internal doc for reference values
    //await CurveStableStake_setRewardForStakedAssets(
    //  curveStableStakeContract,
    //  admin,
    //  ovaReferralAddress,
    //  17520 * 1,
    //  1
    //); // * 1 as we will have 1 pools
    // TODO: remove on mainnet
    await SingleStableStake_setRewardForStakedAssets(
      curveStableStakeCrvContract,
      admin,
      ovaReferralAddress,
      17520 * 2,
      1,
      2
    );
    await SingleStableStake_setRewardForStakedAssets(
      singleStableStakeContract,
      admin,
      ovaReferralAddress,
      43800,
      1,
      2
    );
    await SingleStableStake_setRewardForStakedAssets(
      singleStableStakePremiumContract,
      admin,
      ovaReferralAddress,
      87600,
      1,
      2
    );
    // Fake USDT-USDO pool with tri pool DAI-USDC-USDT LP
    const endTimeStamp = latestTime + 60 * 60 * 24 * 30 * 3;
    console.log(`Ending pools timestamp: ${endTimeStamp}`);
    //await CurveStableStake_addWithNumCoinsAndPool(
    //  curveStableStakeContract,
    //  admin,
    //  CURVE_DAI_USDC_USDT_LP,
    //  ovaReferralAddress,
    //  1,
    //  3,
    //  CURVE_DAI_USDC_USDT_POOL,
    //  endTimeStamp,
    //  false,
    //  true
    //);
    // TODO: remove on mainnet
    await SingleStableStake_addPool(
      curveStableStakeCrvContract,
      admin,
      fakeUsdcUsdo,
      ovaReferralAddress,
      1,
      endTimeStamp,
      false,
      true,
      2
    );
    // TODO: remove on mainnet
    await SingleStableStake_addPool(
      curveStableStakeCrvContract,
      admin,
      fakeUsdtUsdo,
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
      usdoAddr,
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
      usdoAddr,
      ovaReferralAddress,
      1,
      endTimeStamp,
      true,
      true,
      2
    );

    // 8. Remove cool down from sUSDO
    await StakedUSDO_setCooldownStaking(susdoAddr, 0, 2); // None

    // 9. Grant role in USDO
    await grantRole(
      usdoAddr,
      USDO_ABI.abi,
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
    await USDO_proposeNewCollateralSpender(usdoAddr, futureAddress, 2); //replace with usdo
    const usdobackingAddr = await deploy_USDOBacking(
      admin.address,
      treasuryAddr,
      usdoAddr,
      susdoAddr,
      2
    );

    if (futureAddress !== usdobackingAddr) {
      throw new Error("The predicted USDOBacking address is not valid");
    }

    // 11. Grant to the backing contract the rewarder role
    await grantRole(
      susdoAddr,
      SUSDO_ABI.abi,
      "REWARDER_ROLE",
      usdobackingAddr,
      2
    );

    // 12. Mint and stake initial USDO
    const order = {
      benefactor: admin.address,
      beneficiary: admin.address,
      collateral_usdt: USDC_SEPOLIA_ADDRESS,
      collateral_usdc: USDT_SEPOLIA_ADDRESS,
      collateral_usdt_amount: ethers.parseUnits("1", 6),
      collateral_usdc_amount: ethers.parseUnits("1", 6),
      usdo_amount: ethers.parseEther("2")
    };
    await USDO_mint(usdoAddr, order, 2);
    const usdoContract = new ethers.Contract(usdoAddr, USDO_ABI.abi, admin);
    tx = await (usdoContract.connect(admin) as Contract).approve(
      susdoAddr,
      ethers.MaxUint256,
      defaultTransactionOptions
    );
    receipt = await tx.wait();
    console.log(`Approved deployer USDO to sUSDO hash = ${tx.hash}`);
    await StakedUSDO_deposit(susdoAddr, "1", admin.address, 2);

    // 13. Set staking pools inside the referral contract
    await AirdropReward_setStakingPools(
      ovaReferralAddress,
      [
        curveStableStakeCrvAddr,
        singleStableStakePremiumAddr,
        singleStableStakeAddr
      ],
      2
    );

    // 14. Add points trackers
    await AirdropReward_addTrackers(
      ovaReferralAddress,
      [
        curveStableStakeCrvAddr,
        singleStableStakePremiumAddr,
        singleStableStakeAddr
      ],
      2
    );

    // 15. Update referral contract address
    await Liquidity_updateReferral(
      curveStableStakeCrvAddr,
      ovaReferralAddress,
      2
    );
    await Liquidity_updateReferral(
      singleStableStakeAddr,
      ovaReferralAddress,
      2
    );
    await Liquidity_updateReferral(
      singleStableStakePremiumAddr,
      ovaReferralAddress,
      2
    );
  } catch (err) {
    console.error("Batch deployment failed ->", err);
  }
}

main();
