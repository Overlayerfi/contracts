import { ethers } from "ethers";
import OverlayerWrap_ABI from "../../artifacts/contracts/token/OverlayerWrap.sol/OverlayerWrap.json";
const address = "0x9E7ef64F17E79366e70C1Fdc01E1A00323e1FCF8";
const rpc = "";

const provider = new ethers.JsonRpcProvider(rpc);
const contract = new ethers.Contract(address, OverlayerWrap_ABI.abi, provider);

contract.on("*", (event) => {
  console.log(event.eventName);
});
