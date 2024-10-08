import { ethers } from "hardhat";
import { Contract } from "ethers";
import { USDC_ABI } from "../abi/USDC_abi";

export async function transfer(
  token: string,
  decimals: number,
  dest: string,
  amount: string
): Promise<void> {
  const [admin] = await ethers.getSigners();
  const contract = new ethers.Contract(token, USDC_ABI, admin);
  await (contract.connect(admin) as Contract).transfer(
    dest,
    ethers.parseUnits(amount, decimals)
  );
}

transfer("", 6, "", "10")
  .catch((error) => {
    console.error(error);
  })
  .then((res) => {
    console.log("Transfer completed");
  });
