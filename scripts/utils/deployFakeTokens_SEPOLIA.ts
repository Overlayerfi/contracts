import { deploy_ERC20 } from "../functions";

async function main() {
  try {
    const fakeUsdc = await deploy_ERC20("T-USDC", "1000000");
    const fakeUsdt = await deploy_ERC20("T-USDT", "1000000");
    const fakeUsdcUsdo = await deploy_ERC20("T-CrvLP-USDC-USDO", "1000000");
    const fakeUsdtUsdo = await deploy_ERC20("T-CrvLP-USDT-USDO", "1000000");

    console.log("Sepolia::fakeUsdc", fakeUsdc);
    console.log("Sepolia::fakeUsdt", fakeUsdt);
    console.log("Sepolia::fakeUsdcUsdo", fakeUsdcUsdo);
    console.log("Sepolia::fakeUsdtUsdo", fakeUsdtUsdo);
  } catch (err) {
    console.error("Batch deployment failed ->", err);
  }
}

main();
