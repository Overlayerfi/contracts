import { ethers } from "hardhat";
import { ETH_RPC } from "../../rpc";

export async function ethBalance(addr: string, rpc: string): Promise<string> {
	const provider = new ethers.JsonRpcProvider(rpc);
	return ethers.formatEther(await provider.getBalance(addr));
}

ethBalance("0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5", ETH_RPC).catch((error) => {
	console.error(error);
}).then((res) => {
	console.log("ETH balance: " + res);
});
