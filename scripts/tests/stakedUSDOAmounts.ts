import { ethers } from "hardhat";
import abi from "../../artifacts/contracts/token/StakedUSDOFront.sol/StakedUSDOFront.json";

const addr = "0x4d019A38828ef3C355F72cf78D8Ea243f5757826";

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
