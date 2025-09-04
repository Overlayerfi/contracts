import { ethers } from "hardhat";
import overlayerWrapAbi from "../../artifacts/contracts/overlayer/OverlayerWrap.sol/OverlayerWrap.json";

const overlayerWrapAddr = "0xf674FfFd6C4BEAAd55AC2C287DD22f5d89932773";

export async function check(): Promise<void> {
  const [admin] = await ethers.getSigners();
  console.log(`Signer ${await admin.getAddress()}`);
  const contract = new ethers.Contract(
    overlayerWrapAddr,
    overlayerWrapAbi.abi,
    admin
  );
  console.log("proposedSpender:", await contract.proposedSpender());
  console.log("approvedCollateralSpender:", await contract.getSpender());
  console.log("proposalTime:", await contract.proposalTime());
}

check().catch((error) => {
  console.error(error);
});
