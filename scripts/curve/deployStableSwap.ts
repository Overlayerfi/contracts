import { ethers } from "hardhat";
import POOL_DEPLOYER_ABI from "../../artifacts/contracts/curve/CurvePoolDeployer.sol/CurvePoolDeployer.json";

const poolDeployer = "0x8B1fF5da862cDc0e32C6E2c65327b668a4760254";
const tokenA = "0xF8FF4fD5f485CE0FDAA0043f1Db283d9CB691A9F";
const tokenB = "0xC040135dFad78636013ADb0d437DaA123B6A8f74";
const _name = "AB";
const _symbol = "ABs";
const _coins = [tokenA, tokenB];
const _A = 250;
const _fee = 4000000;
const _offpeg_fee_multiplier = 100000000000;
const _ma_exp_time = 866;
const _implementation_idx = 0;
const _asset_types = [0, 0];
const _method_ids = ["0x00000000", "0x00000000"];
const _oracles = [ethers.ZeroAddress, ethers.ZeroAddress];

async function main() {
  const [admin] = await ethers.getSigners();
  const block = await admin.provider.getBlock("latest");
  const baseFee = block.baseFeePerGas;
  const defaultTransactionOptions = {
    maxFeePerGas: baseFee * BigInt(2)
  };
  const factory = new ethers.Contract(
    poolDeployer,
    POOL_DEPLOYER_ABI.abi,
    admin
  );

  const tx = await factory.connect(admin).deployPlainPool(
    {
      name: _name,
      symbol: _symbol,
      coins: _coins,
      A: _A,
      fee: _fee,
      offpeg_fee_multiplier: _offpeg_fee_multiplier,
      ma_exp_time: _ma_exp_time,
      implementation_idx: _implementation_idx,
      asset_types: _asset_types,
      method_ids: _method_ids,
      oracles: _oracles
    },
    defaultTransactionOptions
  );
  const receipt = await tx.wait();

  const pool = await factory.findPoolForCoins(_coins[0], _coins[1]);
  console.log("Pool:", pool);
  console.log("Pool created at:", tx.hash);
}

main().catch((e) => console.error(e));
