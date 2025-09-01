import { ethers } from "hardhat";
import { Contract } from "ethers";
import overlayerWrapAbi from "../../artifacts/contracts/overlayer/OverlayerWrap.sol/OverlayerWrap.json";
import { USDT_SEPOLIA_ADDRESS } from "../addresses";

const overlayerWrapAddr = "0xA0807615Cc7Fd01BAF645e395af093902d691C6c";

export async function mint(
  amount: string,
  decimals: number,
  collateralAddr: string
): Promise<void> {
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
    collateralAmount: ethers.parseUnits(amount, decimals),
    overlayerWrapAmount: ethers.parseEther(amount)
  };
  const tx = await (contract.connect(admin) as Contract).mint(order);
  await tx.wait();
  console.log(`Transaction executed ${tx.hash}`);
}

mint("10", 6, USDT_SEPOLIA_ADDRESS).catch((error) => {
  console.error(error);
});
