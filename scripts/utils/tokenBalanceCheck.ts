import { ethers } from "hardhat";
import { USDC_ABI } from "../abi/USDC_abi";
import { USDT_ADDRESS } from "../addresses";

export async function tokenBalance(
  addr: string,
  target: string,
  rpc: string,
  decimals: number
): Promise<string> {
  const provider = new ethers.JsonRpcProvider(rpc);
  const contract = new ethers.Contract(addr, USDC_ABI, provider);
  return ethers.formatUnits(await contract.balanceOf(target), decimals);
}

tokenBalance(
  USDT_ADDRESS,
  "0x10fc45741bfE5D527c1b83Fe0BD70fC96D7ec30F",
  "http://127.0.0.1:8545/",
  6
)
  .catch((error) => {
    console.error(error);
  })
  .then((res) => {
    console.log("Token balance: " + res);
  });
