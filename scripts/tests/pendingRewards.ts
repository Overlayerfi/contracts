import { ethers } from "hardhat";
import abi from "../../artifacts/contracts/liquidity/CurveStableStake.sol/CurveStableStake.json";
import { OVA_BETA_RPC } from "../../rpc";

const from = "0x10fc45741bfE5D527c1b83Fe0BD70fC96D7ec30F";
const to = "0xa1F55cE218ef2f7c47D8c0Fb0a238a76eE419626";
const stakingAddress = "0xF8FF4fD5f485CE0FDAA0043f1Db283d9CB691A9F";

async function main() {
  const delta = 24 * 60 * 60; //1 days
  const p = new ethers.JsonRpcProvider(OVA_BETA_RPC);
  await p.send("evm_increaseTime", [delta]);
  await p.send("evm_mine");
  const c = new ethers.Contract(stakingAddress, abi.abi, p);
  const i = await c.userInfo(0, from);
  const r = ethers.formatEther(await c.pendingReward(0, from));
  console.log(i);
  console.log(r);
}

main().catch((err) => {
  console.error(err);
});
