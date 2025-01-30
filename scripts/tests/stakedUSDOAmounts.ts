import { ethers } from "hardhat";
import abi from "../../artifacts/contracts/token/StakedUSDOFront.sol/StakedUSDOFront.json";

const addr = "0x00D15604415907AAE09e5454Ca299f2Ee93fA941";

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
