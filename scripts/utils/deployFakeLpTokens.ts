import { deploy_ERC20 } from "../functions";

async function main() {
  try {
    const token = await deploy_ERC20("USDT-USDT+", "1000000", 2);
    return token;
  } catch (err) {
    console.error(err);
  }
}

main();
