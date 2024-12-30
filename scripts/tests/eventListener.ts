import { ethers } from "ethers";
import USDO_ABI from "../../artifacts/contracts/token/USDO.sol/USDO.json"; 
const address = "0x72872f101327902fC805637Cccd9A3542ed31e47"; 
const rpc = "";

const provider = new ethers.JsonRpcProvider(rpc);
const contract = new ethers.Contract(address, USDO_ABI.abi, provider);

contract.on("*", (event) => {
	console.log(event.eventName)
})
