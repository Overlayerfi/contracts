/**
 * tmp / testnet only — deploy mock OG (BonusNFTMock), mint 10 to recipient,
 * wire Liquidity.setOgNft on farms from testnet-deployments/liquidity.json.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Contract } from "ethers";
import { ethers, network } from "hardhat";
import LIQUIDITY_ABI from "../../artifacts/contracts/liquidity/Liquidity.sol/Liquidity.json";

const RECIPIENT = "0x1b4b7eD919416550457d142E54e7f98583E4B018";
const MINT_COUNT = 10;
const MOCK_PATH = resolve("testnet-deployments/mock-origin-nfts.json");
const LIQ_PATH = resolve("testnet-deployments/liquidity.json");

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let i = 1; i <= 8; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (!msg.includes("in-flight transaction limit") || i === 8) throw err;
      const waitMs = 8000 * i;
      console.log(`${label}: in-flight limit, retry ${i}/8 after ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const networkName = network.name;
  if (!existsSync(LIQ_PATH)) {
    throw new Error(`Missing ${LIQ_PATH}`);
  }

  const liq = JSON.parse(readFileSync(LIQ_PATH, "utf8"));
  const liqNet = liq.networks?.[networkName];
  if (!liqNet?.farms) {
    throw new Error(`No farms for ${networkName} in liquidity.json`);
  }

  const admin = await ethers.getSigner(RECIPIENT);
  console.log(`Deploying mock OG on ${networkName} as ${admin.address}`);

  // Liquidity only checks IERC721.balanceOf for OG; bonus rate is hardcoded.
  const BonusNFT = await ethers.getContractFactory("BonusNFTMock", admin);
  const og = await BonusNFT.deploy("Overlayer OG Mock", "OG", 0, 100);
  await og.waitForDeployment();
  const ogAddr = await og.getAddress();
  console.log("Mock OG deployed at", ogAddr);

  for (let i = 0; i < MINT_COUNT; i++) {
    await withRetry(`og mint ${i + 1}`, async () => {
      const tx = await og.mint(RECIPIENT);
      await tx.wait();
    });
  }
  console.log(`Minted ${MINT_COUNT} OG to ${RECIPIENT}`);

  for (const key of Object.keys(liqNet.farms)) {
    const farmAddr = liqNet.farms[key].liquidity as string;
    const farm = new ethers.Contract(farmAddr, LIQUIDITY_ABI.abi, admin);
    await withRetry(`setOgNft ${key}`, async () => {
      const tx = await (farm as Contract).setOgNft(ogAddr, {
        gasLimit: 2000000
      });
      await tx.wait();
    });
    console.log(`setOgNft on ${key} farm ${farmAddr}`);
  }

  liqNet.ogNft = ogAddr;
  liq.networks[networkName] = liqNet;
  writeFileSync(LIQ_PATH, JSON.stringify(liq, null, 2) + "\n");

  if (existsSync(MOCK_PATH)) {
    const mock = JSON.parse(readFileSync(MOCK_PATH, "utf8"));
    if (mock.networks?.[networkName]) {
      mock.networks[networkName].og = {
        address: ogAddr,
        bonusNumerator: 0,
        bonusDenominator: 100,
        note: "Liquidity OG boost uses hardcoded 2.5%; balanceOf only"
      };
      mock.networks[networkName].deployedAt = new Date().toISOString();
      writeFileSync(MOCK_PATH, JSON.stringify(mock, null, 2) + "\n");
    }
  }

  console.log("Done. ogNft =", ogAddr);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
