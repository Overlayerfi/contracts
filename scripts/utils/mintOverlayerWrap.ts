import { ethers } from "hardhat";
import { Contract } from "ethers";
import overlayerWrapAbi from "../../artifacts/contracts/overlayer/OverlayerWrap.sol/OverlayerWrap.json";
import { USDT_SEPOLIA_ADDRESS } from "../addresses";

const overlayerWrapAddr = "0xEac6CF272E777864C0B9f6491ECb1821f9A822aB";
const amount = "10";
const collateralDecimals = 6;
const collateralAddr = USDT_SEPOLIA_ADDRESS;

export async function mint(): Promise<void> {
  const [admin] = await ethers.getSigners();
  console.log(`Signer ${await admin.getAddress()}`);
  const contract = new ethers.Contract(
    overlayerWrapAddr,
    overlayerWrapAbi.abi,
    admin
  );
  const adminAddr = await admin.getAddress();
  const order = {
    benefactor: adminAddr,
    beneficiary: adminAddr,
    collateral: collateralAddr,
    collateralAmount: ethers.parseUnits(amount, collateralDecimals),
    overlayerWrapAmount: ethers.parseEther(amount)
  };
  const tx = await contract.mint(order);
  await tx.wait();
  console.log(`Transaction executed ${tx.hash}`);
}

mint().catch((error) => {
  console.error(error);
});
