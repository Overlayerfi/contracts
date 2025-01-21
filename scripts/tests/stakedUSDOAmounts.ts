import { ethers } from "hardhat";
import abi from "../../artifacts/contracts/token/StakedUSDOFront.sol/StakedUSDOFront.json";
import { OVA_BETA_RPC } from "../../rpc";

const addr = "0xeEeC6A1A9D9ec3Ab5223987c1a57476Ca871c8a0";

async function main() {
  const [signer] = await ethers.getSigners();
  const susdo = new ethers.Contract(addr, abi.abi, signer);
  const totalSupply = ethers.formatEther(
    await susdo.connect(signer).totalSupply()
  );
  const totalAssets = ethers.formatEther(
    await susdo.connect(signer).totalAssets()
  );

  console.log("Tot supply", totalSupply, "tot assets", totalAssets);
}

main().catch((err) => {
  console.error(err);
});
