/**
 * Post-configure Sepolia for each OFT Overlayer product discovered under a contracts-omnichain
 * deployments directory (e.g. deployments-sep). Reads Overlayer*.json + matching OVault-*.json
 * on the ETH chain folder, runs dispatcher / backing / roles / seed mint (same steps as deployAllSepolia
 * for one product), and writes a merged manifest of omnichain + this repo’s deployed addresses.
 *
 * Hardhat rejects custom CLI flags (HH310). Use environment variables:
 *   OMNICHAIN_DEPLOYMENTS_DIR  — path to deployments-sep (required)
 *   OMNICHAIN_ETH_CHAIN_DIR    — default eth-testnet
 *   SEPOLIA_OMNICHAIN_MANIFEST_OUT — output JSON path
 *   SEPOLIA_OMNICHAIN_COLLECT_ONLY=1 — manifest only, no transactions
 *   SEPOLIA_OMNICHAIN_PRODUCT_MAP — optional JSON merging Overlayer* → { vaultSuffix, decimalsKey }
 *   SEPOLIA_SIGNER_ADDR — override default deployer
 */

import * as fs from "fs";
import * as path from "path";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  grantRole,
  OverlayerWrap_proposeNewCollateralSpender,
  deploy_OverlayerWrapBacking,
  OverlayerWrap_mint,
  StakedOverlayerWrap_deposit,
  deploy_Dispatcher
} from "../functions";
import OverlayerWrap_ABI from "../../artifacts/contracts/overlayer/OverlayerWrap.sol/OverlayerWrap.json";
import SOverlayerWrap_ABI from "../../artifacts/contracts/overlayer/StakedOverlayerWrap.sol/StakedOverlayerWrap.json";
import OverlayerWrapBacking_ABI from "../../artifacts/contracts/overlayerbacking/OverlayerBacking.sol/OverlayerWrapBacking.json";
import { getContractAddress } from "@ethersproject/address";
import {
  USDT_SEPOLIA_ADDRESS,
  AUSDT_SEPOLIA_ADDRESS,
  USDC_SEPOLIA_ADDRESS,
  AUSDC_SEPOLIA_ADDRESS,
  EURS_SEPOLIA_ADDRESS,
  AEURS_SEPOLIA_ADDRESS,
  AAVE_POOL_V3_SEPOLIA_ADDRESS
} from "../addresses";
import { SEPOLIA_TOKEN_DECIMALS } from "../constants";
import { USDT_ABI } from "../abi/USDT_abi";

const LOG = "[postConfigureSepoliaOftFromOmnichain]";

/** OpenZeppelin AccessControl DEFAULT_ADMIN_ROLE (bytes32(0)). */
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

/** Stable run order: USDT (T+) before USDC (C+) so logs match typical dependency expectations. */
const PREFERRED_OVERLAYER_ORDER = ["OverlayerTether", "OverlayerCircle"];

function sortOverlayerJsonFiles(files: string[]): string[] {
  return [...files].sort((a, b) => {
    const baseA = a.replace(/\.json$/, "");
    const baseB = b.replace(/\.json$/, "");
    const ia = PREFERRED_OVERLAYER_ORDER.indexOf(baseA);
    const ib = PREFERRED_OVERLAYER_ORDER.indexOf(baseB);
    if (ia === -1 && ib === -1) {
      return a.localeCompare(b);
    }
    if (ia === -1) {
      return 1;
    }
    if (ib === -1) {
      return -1;
    }
    return ia - ib;
  });
}

async function assertSignerIsDefaultAdminOnOverlayer(
  overlayerWrapAddress: string,
  signer: ethers.Signer,
  productLabel: string
): Promise<void> {
  const c = new ethers.Contract(
    overlayerWrapAddress,
    OverlayerWrap_ABI.abi,
    signer
  ) as Contract;
  const me = await signer.getAddress();
  const ok = await c.hasRole(DEFAULT_ADMIN_ROLE, me);
  if (!ok) {
    throw new Error(
      `${LOG} [${productLabel}] Signer ${me} is not DEFAULT_ADMIN on OverlayerWrap at ${overlayerWrapAddress}. ` +
        `The next step calls grantRole(COLLATERAL_MANAGER_ROLE), which requires DEFAULT_ADMIN (on-chain: AccessControlUnauthorizedAccount). ` +
        `deployAllSepolia.ts has no extra step before grantRole — use the key that administers this OFT (see omnichain deploy), or set SEPOLIA_SIGNER_ADDR to that account.`
    );
  }
}

// --- Shared Sepolia post-config (one OFT product) ---------------------------------------------

export interface SepoliaSharedDeploymentConfig {
  signerAddr: string;
  ovaSepoliaTeam: string;
  ovaSepoliaReserveFund: string;
}

export interface SepoliaProductDeploymentInput {
  productLabel: string;
  oftOverlayerWrapAddr: string;
  stakedOverlayerWrapAddr: string;
  collateralAddress: string;
  aCollateralAddress: string;
  decimals: number;
}

export interface SepoliaProductDeploymentResult {
  productLabel: string;
  oftOverlayerWrapAddr: string;
  stakedOverlayerWrapAddr: string;
  dispatcherAddress: string;
  overlayerWrapBackingAddress: string;
}

export const DEFAULT_SEPOLIA_SHARED: SepoliaSharedDeploymentConfig = {
  signerAddr: "0x1b4b7eD919416550457d142E54e7f98583E4B018",
  ovaSepoliaTeam: "0x4b05A19E5b50498fe94d9F7A7c8362f5ACc457b1",
  ovaSepoliaReserveFund: "0x7bE51020c8c6a9153B3C8688410d201bbbb27fB9"
};

function ts(): string {
  return new Date().toISOString();
}

/**
 * Dispatcher, OverlayerWrapBacking, roles, and seed mint/stake for one OFT-backed product.
 * Mirrors the active path in scripts/utils/deployAllSepolia.ts without modifying that file.
 */
export async function runSepoliaOftProductPostConfigure(
  product: SepoliaProductDeploymentInput,
  shared: SepoliaSharedDeploymentConfig = DEFAULT_SEPOLIA_SHARED
): Promise<SepoliaProductDeploymentResult> {
  const admin = await ethers.getSigner(shared.signerAddr);
  console.log(`${LOG} [${ts()}] [${product.productLabel}] Signer:`, admin.address);

  const defaultTransactionOptions = { gasLimit: 2000000 };
  const overlayerWrapAddr = product.oftOverlayerWrapAddr;
  const sOverlayerWrapAddr = product.stakedOverlayerWrapAddr;

  console.log(
    `${LOG} [${ts()}] [${product.productLabel}] OverlayerWrap (OFT): ${overlayerWrapAddr}`
  );
  console.log(
    `${LOG} [${ts()}] [${product.productLabel}] StakedOverlayerWrap (vault): ${sOverlayerWrapAddr}`
  );

  await assertSignerIsDefaultAdminOnOverlayer(
    overlayerWrapAddr,
    admin,
    product.productLabel
  );

  const dispatcherAddress = await deploy_Dispatcher(
    admin.address,
    shared.ovaSepoliaTeam,
    shared.ovaSepoliaReserveFund,
    shared.ovaSepoliaReserveFund,
    overlayerWrapAddr,
    admin
  );

  await grantRole(
    overlayerWrapAddr,
    OverlayerWrap_ABI.abi,
    "COLLATERAL_MANAGER_ROLE",
    admin.address,
    2,
    admin
  );

  const backingNonce = (await admin.getNonce()) + 1;
  const futureAddress = getContractAddress({
    from: admin.address,
    nonce: backingNonce
  });
  await OverlayerWrap_proposeNewCollateralSpender(
    overlayerWrapAddr,
    futureAddress,
    admin
  );

  const overlayerWrapBackingAddr = await deploy_OverlayerWrapBacking(
    admin.address,
    dispatcherAddress,
    overlayerWrapAddr,
    sOverlayerWrapAddr,
    AAVE_POOL_V3_SEPOLIA_ADDRESS,
    product.collateralAddress,
    product.aCollateralAddress,
    admin
  );

  if (futureAddress !== overlayerWrapBackingAddr) {
    throw new Error("The predicted OverlayerWrapBacking address is not valid");
  }

  const backing = new ethers.Contract(
    overlayerWrapBackingAddr,
    OverlayerWrapBacking_ABI.abi,
    admin
  );
  let tx = await (backing.connect(admin) as Contract).acceptCollateralSpender(
    defaultTransactionOptions
  );
  await tx.wait();

  await grantRole(
    sOverlayerWrapAddr,
    SOverlayerWrap_ABI.abi,
    "REWARDER_ROLE",
    overlayerWrapBackingAddr,
    2,
    admin
  );

  const collateralContract = new ethers.Contract(
    product.collateralAddress,
    USDT_ABI,
    admin
  );
  tx = await (collateralContract.connect(admin) as Contract).approve(
    overlayerWrapAddr,
    ethers.MaxUint256,
    defaultTransactionOptions
  );
  console.log(
    `${LOG} [${ts()}] [${product.productLabel}] Approved collateral to OverlayerWrap hash = ${tx.hash}`
  );

  const order = {
    benefactor: admin.address,
    beneficiary: admin.address,
    collateral: product.collateralAddress,
    collateralAmount: ethers.parseUnits("1", product.decimals),
    overlayerWrapAmount: ethers.parseEther("1")
  };
  await OverlayerWrap_mint(overlayerWrapAddr, order, admin);

  const overlayerWrapContract = new ethers.Contract(
    overlayerWrapAddr,
    OverlayerWrap_ABI.abi,
    admin
  );
  tx = await (overlayerWrapContract.connect(admin) as Contract).approve(
    sOverlayerWrapAddr,
    ethers.MaxUint256,
    defaultTransactionOptions
  );
  await tx.wait();
  console.log(
    `${LOG} [${ts()}] [${product.productLabel}] Approved OverlayerWrap to StakedOverlayerWrap hash = ${tx.hash}`
  );

  await StakedOverlayerWrap_deposit(
    sOverlayerWrapAddr,
    "1",
    admin.address,
    admin
  );

  return {
    productLabel: product.productLabel,
    oftOverlayerWrapAddr: overlayerWrapAddr,
    stakedOverlayerWrapAddr: sOverlayerWrapAddr,
    dispatcherAddress,
    overlayerWrapBackingAddress: overlayerWrapBackingAddr
  };
}

// --- Omnichain manifest + multi-product orchestration -----------------------------------------

type ProductMapEntry = {
  vaultSuffix: string;
  decimalsKey: keyof typeof SEPOLIA_TOKEN_DECIMALS;
};

const DEFAULT_OVERLAYER_TO_PRODUCT: Record<string, ProductMapEntry> = {
  OverlayerTether: { vaultSuffix: "T+", decimalsKey: "USDT" },
  OverlayerCircle: { vaultSuffix: "C+", decimalsKey: "USDC" }
};

const COLLATERAL_BY_DECIMALS_KEY: Record<
  keyof typeof SEPOLIA_TOKEN_DECIMALS,
  { collateral: string; aCollateral: string }
> = {
  USDT: { collateral: USDT_SEPOLIA_ADDRESS, aCollateral: AUSDT_SEPOLIA_ADDRESS },
  USDC: { collateral: USDC_SEPOLIA_ADDRESS, aCollateral: AUSDC_SEPOLIA_ADDRESS },
  EURS: { collateral: EURS_SEPOLIA_ADDRESS, aCollateral: AEURS_SEPOLIA_ADDRESS }
};

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (const a of argv) {
    if (a === "--collect-only") {
      out["collect-only"] = true;
      continue;
    }
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function readJsonAddress(filePath: string): string {
  const raw = fs.readFileSync(filePath, "utf8");
  const j = JSON.parse(raw) as { address?: string };
  if (!j.address || typeof j.address !== "string") {
    throw new Error(`Missing address in ${filePath}`);
  }
  return j.address;
}

function collectOmnichainChains(deploymentsRoot: string) {
  const chains: Record<
    string,
    { chainId: string; contracts: Record<string, string> }
  > = {};

  if (!fs.existsSync(deploymentsRoot)) {
    throw new Error(`Deployments root not found: ${deploymentsRoot}`);
  }

  for (const name of fs.readdirSync(deploymentsRoot)) {
    const chainPath = path.join(deploymentsRoot, name);
    if (!fs.statSync(chainPath).isDirectory() || name === "solcInputs") {
      continue;
    }
    const chainIdPath = path.join(chainPath, ".chainId");
    const chainId = fs.existsSync(chainIdPath)
      ? fs.readFileSync(chainIdPath, "utf8").trim()
      : "";

    const contracts: Record<string, string> = {};
    for (const f of fs.readdirSync(chainPath)) {
      if (!f.endsWith(".json")) continue;
      const full = path.join(chainPath, f);
      if (!fs.statSync(full).isDirectory()) {
        try {
          const addr = readJsonAddress(full);
          contracts[f.replace(/\.json$/, "")] = addr;
        } catch {
          /* skip */
        }
      }
    }
    chains[name] = { chainId, contracts };
  }
  return chains;
}

function loadProductMap(): Record<string, ProductMapEntry> {
  const base = { ...DEFAULT_OVERLAYER_TO_PRODUCT };
  const extraPath = process.env.SEPOLIA_OMNICHAIN_PRODUCT_MAP;
  if (extraPath && fs.existsSync(extraPath)) {
    const extra = JSON.parse(
      fs.readFileSync(extraPath, "utf8")
    ) as Record<string, ProductMapEntry>;
    Object.assign(base, extra);
  }
  return base;
}

function resolveSharedConfig(): SepoliaSharedDeploymentConfig {
  if (process.env.SEPOLIA_SIGNER_ADDR) {
    return {
      ...DEFAULT_SEPOLIA_SHARED,
      signerAddr: process.env.SEPOLIA_SIGNER_ADDR
    };
  }
  return DEFAULT_SEPOLIA_SHARED;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const deploymentsRoot = path.resolve(
    (args["deployments-root"] as string) ||
      process.env.OMNICHAIN_DEPLOYMENTS_DIR ||
      ""
  );
  if (!deploymentsRoot) {
    throw new Error(
      `${LOG} Set OMNICHAIN_DEPLOYMENTS_DIR to the omnichain deployments folder (e.g. .../deployments-sep). Hardhat run rejects custom --flags; use env vars.`
    );
  }

  const ethChainDir =
    (args["eth-chain-dir"] as string) ||
    process.env.OMNICHAIN_ETH_CHAIN_DIR ||
    "eth-testnet";

  const outputPath = path.resolve(
    (args.output as string) ||
      process.env.SEPOLIA_OMNICHAIN_MANIFEST_OUT ||
      path.join(process.cwd(), "sepolia-omnichain-manifest.json")
  );

  const collectOnly =
    args["collect-only"] === true ||
    process.env.SEPOLIA_OMNICHAIN_COLLECT_ONLY === "1" ||
    process.env.SEPOLIA_OMNICHAIN_COLLECT_ONLY === "true";

  const productMap = loadProductMap();
  const shared = resolveSharedConfig();
  const chains = collectOmnichainChains(deploymentsRoot);
  const ethPath = path.join(deploymentsRoot, ethChainDir);
  if (!fs.existsSync(ethPath)) {
    throw new Error(`${LOG} ETH chain folder not found: ${ethPath}`);
  }

  const contractsRepoDeployments: Record<
    string,
    {
      OvaDispatcher: string;
      OverlayerWrapBacking: string;
      oftOverlayerWrap: string;
      stakedOverlayerWrap: string;
    }
  > = {};

  if (!collectOnly) {
    const overlayerFiles = sortOverlayerJsonFiles(
      fs
        .readdirSync(ethPath)
        .filter(
          (f) =>
            f.startsWith("Overlayer") && f.endsWith(".json") && !f.includes("/")
        )
    );

    const oftAddrByProduct = new Map<string, string>();
    for (const file of overlayerFiles) {
      const base = file.replace(/\.json$/, "");
      if (!productMap[base]) {
        continue;
      }
      oftAddrByProduct.set(base, readJsonAddress(path.join(ethPath, file)));
    }
    const addrToProducts = new Map<string, string[]>();
    for (const [prod, addr] of oftAddrByProduct) {
      const list = addrToProducts.get(addr) ?? [];
      list.push(prod);
      addrToProducts.set(addr, list);
    }
    for (const [addr, prods] of addrToProducts) {
      if (prods.length > 1) {
        throw new Error(
          `${LOG} Same OverlayerWrap address ${addr} is listed for multiple products: ${prods.join(", ")}. Fix omnichain deployment JSONs (each Overlayer*.json should have a unique \`address\`).`
        );
      }
    }

    for (const file of overlayerFiles) {
      const base = file.replace(/\.json$/, "");
      const meta = productMap[base];
      if (!meta) {
        console.warn(
          `${LOG} Skip ${file}: no product map entry (DEFAULT_OVERLAYER_TO_PRODUCT or SEPOLIA_OMNICHAIN_PRODUCT_MAP)`
        );
        continue;
      }

      const vaultFile = `OVault-${meta.vaultSuffix}.json`;
      const oftJsonPath = path.join(ethPath, file);
      const vaultPath = path.join(ethPath, vaultFile);
      if (!fs.existsSync(vaultPath)) {
        throw new Error(`Expected vault deployment at ${vaultPath}`);
      }

      const coll = COLLATERAL_BY_DECIMALS_KEY[meta.decimalsKey];
      const decimals = SEPOLIA_TOKEN_DECIMALS[meta.decimalsKey];

      const result = await runSepoliaOftProductPostConfigure(
        {
          productLabel: base,
          oftOverlayerWrapAddr: readJsonAddress(oftJsonPath),
          stakedOverlayerWrapAddr: readJsonAddress(vaultPath),
          collateralAddress: coll.collateral,
          aCollateralAddress: coll.aCollateral,
          decimals
        },
        shared
      );

      contractsRepoDeployments[base] = {
        OvaDispatcher: result.dispatcherAddress,
        OverlayerWrapBacking: result.overlayerWrapBackingAddress,
        oftOverlayerWrap: result.oftOverlayerWrapAddr,
        stakedOverlayerWrap: result.stakedOverlayerWrapAddr
      };
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    omnichainDeploymentsRoot: deploymentsRoot,
    ethChainFolder: ethChainDir,
    chains: Object.fromEntries(
      Object.entries(chains).map(([folder, data]) => {
        const entry: Record<string, unknown> = {
          chainId: data.chainId,
          omnichain: data.contracts
        };
        if (
          folder === ethChainDir &&
          Object.keys(contractsRepoDeployments).length > 0
        ) {
          entry.contractsRepoSepolia = contractsRepoDeployments;
        }
        return [folder, entry];
      })
    )
  };

  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`${LOG} Wrote manifest: ${outputPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
