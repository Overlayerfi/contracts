import { ethers } from "hardhat";
import abi from "../../artifacts/contracts/mock_ERC20/MintableERC20.sol/MintableERC20.json";
import { USDC_ADDRESS, USDT_ADDRESS } from "../addresses";

const to = "0x3694d7c2C1b9d28eba4d5aDe815876EF55f860ea";

async function main() {
  const [signer] = await ethers.getSigners();
  const usdc = new ethers.Contract(USDC_ADDRESS, abi.abi, signer);
  const usdt = new ethers.Contract(USDT_ADDRESS, abi.abi, signer);

  await usdc.connect(signer).transfer(to, ethers.parseUnits("100", 6));
  await usdt.connect(signer).transfer(to, ethers.parseUnits("100", 6));

  console.log("Transfer completed to", to);
}

main().catch((err) => {
  console.error(err);
});
