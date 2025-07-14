import { ethers } from "hardhat";
import POOL_DEPLOYER_ABI from "../../artifacts/contracts/curve/CurvePoolDeployer.sol/CurvePoolDeployer.json";

const poolDeployer = "0xf55BA196EE7a845A75B83A0718C43eB587297435";
const tokenA = "0x5350D7220ab169F7972c7C840AE5D11960827287";
const tokenB = "0xeB5b07B100eFFEe9a94C6738DB9e9b2C28eF5251";
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
