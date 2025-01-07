import { ethers } from "hardhat";
import OVAREFERRAL_ABI from "../../artifacts/contracts/token/OvaReferral.sol/OvaReferral.json";
import CURVESTABLESTAKINGPOOL_ABI from "../../artifacts/contracts/liquidity/CurveStableStake.sol/CurveStableStake.json";
import ERC20_ABI from "../../artifacts/contracts/mock_ERC20/FixedSupplyERC20.sol/FixedSupplyERC20.json";
import { OVA_BETA_RPC } from "../../rpc";
import * as dotenv from "dotenv";
import { decodeCustomError } from "../functions";
import { CURVE_DAI_USDC_USDT_LP } from "../addresses";

dotenv.config({ path: process.cwd() + "/process.env" });

const provider = new ethers.JsonRpcProvider(OVA_BETA_RPC);
const owner = new ethers.Wallet(process.env.ADMIN_WALLET_KEY!, provider);
const ovaReferralAddress = "0x00D15604415907AAE09e5454Ca299f2Ee93fA941";
const stakedCurveLpAddress = CURVE_DAI_USDC_USDT_LP;
const curveStableStakingPoolAddress =
  "0xF8FF4fD5f485CE0FDAA0043f1Db283d9CB691A9F";
const pid = 0;

async function giveFunds(amount: string, to: string) {
  console.log(`Giving funds from ${owner.address} to ${to}`);
  const tx = {
    to: to,
    value: ethers.parseEther(amount)
  };
  const transactionResponse = await owner.sendTransaction(tx);
  console.log("Transaction sent! Waiting for confirmation...");
  console.log(`Transaction Hash: ${transactionResponse.hash}`);

  const receipt = await transactionResponse.wait();
  console.log("Transaction confirmed!");
  // console.log(`Transaction Receipt: ${JSON.stringify(receipt, null, 2)}`);
}

async function main() {
  const block = await provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const defaultTransactionOptions = {
    maxFeePerGas: baseFee * BigInt(2)
  };
  const signerNum = 2;
  if (signerNum % 2 !== 0) {
    throw new Error("Must give an even number");
  }
  const codesNum = signerNum / 2;
  const signers = [];
  const codes = [];
  for (let i = 0; i < signerNum; i++) {
    signers.push(
      new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider)
    );
    console.log("Signer:", signers[i].address);
    await giveFunds("2", signers[i].address);
  }
  for (let i = 0; i < codesNum; i++) {
    codes.push(`code${i}#${signers[i].address}`);
    console.log("Code:", codes[i]);
  }
  const ovaReferralContract = new ethers.Contract(
    ovaReferralAddress,
    OVAREFERRAL_ABI.abi
  );
  const curveStableStakingContract = new ethers.Contract(
    curveStableStakingPoolAddress,
    CURVESTABLESTAKINGPOOL_ABI.abi
  );
  const curveStableStakingLpContract = new ethers.Contract(
    stakedCurveLpAddress,
    ERC20_ABI.abi
  );

  try {
    // Add codes
    for (let i = 0; i < codesNum; i++) {
      let tx = await ovaReferralContract
        .connect(signers[i])
        .addCodeSelf(codes[i]);
      console.log("Transaction sent! Waiting for confirmation...");
      console.log(`Transaction Hash: ${tx.hash}`);
      tx = await tx.wait();
      console.log("Transaction confirmed!");
      // console.log(`Transaction Receipt: ${JSON.stringify(tx, null, 2)}`);
    }

    // Consume codes
    for (let i = 0; i < codesNum; i++) {
      let tx = await ovaReferralContract
        .connect(signers[i + codesNum])
        .consumeReferral(codes[i], signers[i + codesNum]);
      console.log("Transaction sent! Waiting for confirmation...");
      console.log(`Transaction Hash: ${tx.hash}`);
      tx = await tx.wait();
      console.log("Transaction confirmed!");
      // console.log(`Transaction Receipt: ${JSON.stringify(tx, null, 2)}`);
    }
  } catch (e) {
    console.error(e);
    console.log("Try to decode it...");
    decodeCustomError(e, OVAREFERRAL_ABI.abi);
  }

  try {
    // Send some crv lp to mock stakers
    for (let i = 0; i < codesNum; i++) {
      let tx = await curveStableStakingLpContract
        .connect(owner)
        .transfer(signers[i + codesNum], ethers.parseEther("1"));
      console.log("Transaction sent! Waiting for confirmation...");
      console.log(`Transaction Hash: ${tx.hash}`);
      tx = await tx.wait();
      console.log("Transaction confirmed!");
      // console.log(`Transaction Receipt: ${JSON.stringify(tx, null, 2)}`);

      tx = await curveStableStakingLpContract
        .connect(signers[i + codesNum])
        .approve(curveStableStakingPoolAddress, ethers.MaxUint256);
      tx = await tx.wait();
    }
  } catch (e) {
    console.error(e);
    console.log("Try to decode it...");
    decodeCustomError(e, ERC20_ABI.abi);
  }

  try {
    // Stake
    for (let i = 0; i < codesNum; i++) {
      let tx = await curveStableStakingContract
        .connect(signers[i + codesNum])
        .deposit(pid, ethers.parseEther("1"));
      console.log("Transaction sent! Waiting for confirmation...");
      console.log(`Transaction Hash: ${tx.hash}`);
      tx = await tx.wait();
      console.log("Transaction confirmed!");
      // console.log(`Transaction Receipt: ${JSON.stringify(tx, null, 2)}`);
    }

    let delta = 60 * 60 * 24; // 1 days
    await provider.send("evm_increaseTime", [delta]);
    await provider.send("evm_mine");

    // Harvest
    for (let i = 0; i < codesNum; i++) {
      let tx = await curveStableStakingContract
        .connect(signers[i + codesNum])
        .harvest(pid);
      console.log("Transaction sent! Waiting for confirmation...");
      console.log(`Transaction Hash: ${tx.hash}`);
      tx = await tx.wait();
      console.log("Transaction confirmed!");
      // console.log(`Transaction Receipt: ${JSON.stringify(tx, null, 2)}`);
    }

    delta = 60 * 60 * 2; // 2 hours
    await provider.send("evm_increaseTime", [delta]);
    await provider.send("evm_mine");

    // Harvest
    for (let i = 0; i < codesNum; i++) {
      let tx = await curveStableStakingContract
        .connect(signers[i + codesNum])
        .withdraw(pid, ethers.parseEther("1"));
      console.log("Transaction sent! Waiting for confirmation...");
      console.log(`Transaction Hash: ${tx.hash}`);
      tx = await tx.wait();
      console.log("Transaction confirmed!");
      // console.log(`Transaction Receipt: ${JSON.stringify(tx, null, 2)}`);
    }
  } catch (e) {
    console.error(e);
    console.log("Try to decode it with first abi...");
    decodeCustomError(e, OVAREFERRAL_ABI.abi);
    console.log("Try to decode it with second abi...");
    decodeCustomError(e, CURVESTABLESTAKINGPOOL_ABI.abi);
  }
}

main().catch((err) => {
  console.error(err);
});
