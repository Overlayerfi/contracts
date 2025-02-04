import { ethers } from "hardhat";
import USDO_ABI from "../../artifacts/contracts/token/USDO.sol/USDO.json";
import { AAVE_POOL_V3_ABI } from "../abi/AAVE_POOL_V3";
import { USDC_ABI } from "../abi/USDC_abi";
import { USDT_ABI } from "../abi/USDT_abi";

const USDO_ADDRESS = "0x9E7ef64F17E79366e70C1Fdc01E1A00323e1FCF8";
const AVAE_V3_POOL_ADDRESS = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

async function approve() {
  const [signer] = await ethers.getSigners();
  const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
  const usdtContract = new ethers.Contract(USDT_ADDRESS, USDT_ABI, signer);
  await usdcContract.connect(signer).approve(USDO_ADDRESS, ethers.MaxUint256);
  await usdcContract
    .connect(signer)
    .approve(AVAE_V3_POOL_ADDRESS, ethers.MaxUint256);
  await usdtContract.connect(signer).approve(USDO_ADDRESS, 0);
  await usdtContract.connect(signer).approve(USDO_ADDRESS, ethers.MaxUint256);
  await usdtContract.connect(signer).approve(AVAE_V3_POOL_ADDRESS, 0);
  await usdtContract
    .connect(signer)
    .approve(AVAE_V3_POOL_ADDRESS, ethers.MaxUint256);
}

async function estimate() {
  const [signer] = await ethers.getSigners();
  const usdoContract = new ethers.Contract(USDO_ADDRESS, USDO_ABI.abi, signer);
  const aaveContract = new ethers.Contract(
    AVAE_V3_POOL_ADDRESS,
    AAVE_POOL_V3_ABI,
    signer
  );

  const order = {
    benefactor: signer.address,
    beneficiary: signer.address,
    collateral_usdt: USDT_ADDRESS,
    collateral_usdc: USDC_ADDRESS,
    collateral_usdt_amount: ethers.parseUnits("10000", 6),
    collateral_usdc_amount: ethers.parseUnits("10000", 6),
    usdo_amount: ethers.parseEther("20000")
  };

  await approve();

  const amount0 = await usdoContract.connect(signer).mint.estimateGas(order);
  // From real estimates amount1 should already include amount2 + amount3
  const amount1 = await usdoContract
    .connect(signer)
    .supplyToBacking.estimateGas();
  const amount2 = await aaveContract
    .connect(signer)
    .supply.estimateGas(
      USDC_ADDRESS,
      ethers.parseUnits("0.5", 6),
      signer.address,
      0
    );
  const amount3 = await aaveContract
    .connect(signer)
    .supply.estimateGas(
      USDT_ADDRESS,
      ethers.parseUnits("0.5", 6),
      signer.address,
      0
    );

  console.log(`Amounts: ${amount0}, ${amount1}, ${amount2}, ${amount3}`);
}

estimate().catch((e) => console.error(e));
