import { deploy_ERC20 } from "../functions";

export async function deployFakeLp(nameSymbol: string, supply: string) {
  try {
    const token = await deploy_ERC20(nameSymbol, supply, 2);
    return token;
  } catch (err) {
    console.error(err);
    return "";
  }
}

async function main() {
  await deployFakeLp("USDT-USDT+", "1000000");
}

main();
