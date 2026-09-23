/**
 * Post-configure mainnet OFT Overlayer products discovered under a
 * contracts-omnichain deployments directory. Reads Overlayer*.json + matching
 * OVault-*.json on the ETH mainnet chain folder, runs dispatcher / backing /
 * roles / seed mint, and writes a merged manifest of omnichain + this repo’s
 * deployed addresses.
 *
 * Hardhat rejects custom CLI flags (HH310). Use environment variables:
 *   OMNICHAIN_DEPLOYMENTS_DIR — path to mainnet deployments directory (required)
 *   OMNICHAIN_ETH_CHAIN_DIR   — default eth-mainnet
 *   OMNICHAIN_COLLECT_ONLY=1  — manifest only, no transactions
 *   OMNICHAIN_PRODUCT_MAP     — optional JSON merging Overlayer* → { vaultSuffix, decimalsKey }
 *   OMNICHAIN_SIGNER_ADDR     — required; must match the configured Hardhat private key
 *   OVA_TEAM                  — required dispatcher team recipient
 *   OVA_SAFETY_MODULE         — required dispatcher safety module recipient
 *   OVA_BUYBACK               — required dispatcher buyback recipient
 *   OMNICHAIN_MANIFEST_OUT    — output JSON path
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
  StakedOverlayerWrap_connectBacking,
  deploy_Dispatcher
} from "../functions";
import OverlayerWrap_ABI from "../../artifacts/contracts/overlayer/OverlayerWrap.sol/OverlayerWrap.json";
import SOverlayerWrap_ABI from "../../artifacts/contracts/overlayer/StakedOverlayerWrap.sol/StakedOverlayerWrap.json";
import { getContractAddress } from "@ethersproject/address";
import {
  USDT_ADDRESS,
  AUSDT_ADDRESS,
  USDC_ADDRESS,
  AUSDC_ADDRESS,
  USDG_ADDRESS,
  AUSDG_ADDRESS,
  GHO_ADDRESS,
  SGHO_ADDRESS,
  AAVE_POOL_V3_ADDRESS
} from "../addresses";
import { ETH_MAINNET_TOKEN_DECIMALS } from "../constants";
import { USDT_ABI } from "../abi/USDT_abi";

const LOG = "[postConfigureMainnetOftFromOmnichain]";

/** OpenZeppelin AccessControl DEFAULT_ADMIN_ROLE (bytes32(0)). */
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
const BACKING_ABI = ["function acceptCollateralSpender() external"];

/** Stable run order so logs and manifests are deterministic. */
const PREFERRED_OVERLAYER_ORDER = [
  "OverlayerTether",
  "OverlayerCircle",
  "OverlayerUSDG"
];

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

async function assertSignerHasDefaultAdmin(
  target: string,
  abi: readonly unknown[] | unknown[],
  signer: ethers.Signer,
  productLabel: string,
  contractLabel: string,
  nextStep: string
): Promise<void> {
  const c = new ethers.Contract(target, abi, signer) as Contract;
  const me = await signer.getAddress();
  const ok = await c.hasRole(DEFAULT_ADMIN_ROLE, me);
  if (!ok) {
    throw new Error(
      `${LOG} [${productLabel}] Signer ${me} is not DEFAULT_ADMIN on ${contractLabel} at ${target}. ` +
        `${nextStep}`
    );
  }
}

async function assertSignerIsDefaultAdminOnOverlayer(
  overlayerWrapAddress: string,
  signer: ethers.Signer,
  productLabel: string
): Promise<void> {
  await assertSignerHasDefaultAdmin(
    overlayerWrapAddress,
    OverlayerWrap_ABI.abi,
    signer,
    productLabel,
    "OverlayerWrap",
    "The next step calls grantRole(COLLATERAL_MANAGER_ROLE), which requires DEFAULT_ADMIN (on-chain: AccessControlUnauthorizedAccount). " +
      "Use the key that administers this OFT (see omnichain deploy), and set OMNICHAIN_SIGNER_ADDR to that account."
  );
}

async function assertOftCollateralSettings(
  overlayerWrapAddress: string,
  product: MainnetProductDeploymentInput,
  signer: ethers.Signer
): Promise<void> {
  const c = new ethers.Contract(
    overlayerWrapAddress,
    OverlayerWrap_ABI.abi,
    signer
  ) as Contract;
  const collateral = await c.collateral();
  const aCollateral = await c.aCollateral();
  const collateralAddr = String(collateral.addr ?? collateral[0]);
  const aCollateralAddr = String(aCollateral.addr ?? aCollateral[0]);
  const collateralDecimals = Number(collateral.decimals ?? collateral[1]);
  const aCollateralDecimals = Number(aCollateral.decimals ?? aCollateral[1]);

  if (collateralAddr.toLowerCase() !== product.collateralAddress.toLowerCase()) {
    throw new Error(
      `${LOG} [${product.productLabel}] collateral is ${collateralAddr}, expected ${product.collateralAddress}`
    );
  }
  if (product.backingKind === "gho") {
    // sGHO is not 1:1 with GHO. The OFT aCollateral slot must be a different token
    // so the audited wrap rejects sGHO mint and redeem.
    if (
      aCollateralAddr.toLowerCase() === product.aCollateralAddress.toLowerCase()
    ) {
      throw new Error(
        `${LOG} [${product.productLabel}] aCollateral must not be the sGHO vault ${product.aCollateralAddress}`
      );
    }
  } else if (
    aCollateralAddr.toLowerCase() !== product.aCollateralAddress.toLowerCase()
  ) {
    throw new Error(
      `${LOG} [${product.productLabel}] aCollateral is ${aCollateralAddr}, expected ${product.aCollateralAddress}`
    );
  }
  if (
    collateralDecimals !== product.decimals ||
    aCollateralDecimals !== product.decimals
  ) {
    throw new Error(
      `${LOG} [${product.productLabel}] collateral decimals are ${collateralDecimals}/${aCollateralDecimals}, expected ${product.decimals}`
    );
  }
}

async function assertSignerIsDefaultAdminOnStakedOverlayer(
  sOverlayerWrapAddress: string,
  signer: ethers.Signer,
  productLabel: string
): Promise<void> {
  await assertSignerHasDefaultAdmin(
    sOverlayerWrapAddress,
    SOverlayerWrap_ABI.abi,
    signer,
    productLabel,
    "StakedOverlayerWrap",
    "proposeOverlayerWrapBacking / executeOverlayerWrapBackingChange require DEFAULT_ADMIN. " +
      "Use the key that administers this vault, and set OMNICHAIN_SIGNER_ADDR to that account."
  );
}

// --- Shared mainnet post-config (one OFT product) ---------------------------------------------

export interface MainnetSharedDeploymentConfig {
  signerAddr: string;
  team: string;
  safetyModule: string;
  buyBack: string;
}

export interface MainnetProductDeploymentInput {
  productLabel: string;
  oftOverlayerWrapAddr: string;
  stakedOverlayerWrapAddr: string;
  collateralAddress: string;
  aCollateralAddress: string;
  decimals: number;
  backingKind: BackingKind;
}

export interface MainnetProductDeploymentResult {
  productLabel: string;
  oftOverlayerWrapAddr: string;
  stakedOverlayerWrapAddr: string;
  dispatcherAddress: string;
  overlayerWrapBackingAddress: string;
  backingContract: string;
}

function ts(): string {
  return new Date().toISOString();
}

/**
 * Dispatcher, OverlayerWrapBacking, roles, and seed mint/stake for one OFT-backed product.
 */
async function deployMainnetBacking(
  product: MainnetProductDeploymentInput,
  admin: ethers.Signer,
  dispatcherAddress: string,
  overlayerWrapAddr: string,
  sOverlayerWrapAddr: string
): Promise<{ address: string; contractName: string }> {
  if (product.backingKind === "gho") {
    const factory = await ethers.getContractFactory(
      "OverlayerWrapGhoBacking",
      admin
    );
    const backing = await factory.deploy(
      await admin.getAddress(),
      dispatcherAddress,
      overlayerWrapAddr,
      sOverlayerWrapAddr,
      product.collateralAddress,
      product.aCollateralAddress,
      { gasLimit: 10000000 }
    );
    await backing.waitForDeployment();
    const address = await backing.getAddress();
    console.log(
      `${LOG} [${ts()}] [${product.productLabel}] Deployed OverlayerWrapGhoBacking: ${address}`
    );
    return { address, contractName: "OverlayerWrapGhoBacking" };
  }

  const address = await deploy_OverlayerWrapBacking(
    await admin.getAddress(),
    dispatcherAddress,
    overlayerWrapAddr,
    sOverlayerWrapAddr,
    AAVE_POOL_V3_ADDRESS,
    product.collateralAddress,
    product.aCollateralAddress,
    admin
  );
  return { address, contractName: "OverlayerWrapBacking" };
}

export async function runMainnetOftProductPostConfigure(
  product: MainnetProductDeploymentInput,
  shared: MainnetSharedDeploymentConfig
): Promise<MainnetProductDeploymentResult> {
  const admin = await ethers.getSigner(shared.signerAddr);
  console.log(
    `${LOG} [${ts()}] [${product.productLabel}] Signer:`,
    admin.address
  );

  const defaultTransactionOptions = { gasLimit: 2000000 };
  const overlayerWrapAddr = product.oftOverlayerWrapAddr;
  const sOverlayerWrapAddr = product.stakedOverlayerWrapAddr;

  console.log(
    `${LOG} [${ts()}] [${
      product.productLabel
    }] OverlayerWrap (OFT): ${overlayerWrapAddr}`
  );
  console.log(
    `${LOG} [${ts()}] [${
      product.productLabel
    }] StakedOverlayerWrap (vault): ${sOverlayerWrapAddr}`
  );

  await assertSignerIsDefaultAdminOnOverlayer(
    overlayerWrapAddr,
    admin,
    product.productLabel
  );
  await assertSignerIsDefaultAdminOnStakedOverlayer(
    sOverlayerWrapAddr,
    admin,
    product.productLabel
  );
  await assertOftCollateralSettings(overlayerWrapAddr, product, admin);

  const dispatcherAddress = await deploy_Dispatcher(
    admin.address,
    shared.team,
    shared.safetyModule,
    shared.buyBack,
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

  const deployedBacking = await deployMainnetBacking(
    product,
    admin,
    dispatcherAddress,
    overlayerWrapAddr,
    sOverlayerWrapAddr
  );
  const overlayerWrapBackingAddr = deployedBacking.address;

  if (futureAddress !== overlayerWrapBackingAddr) {
    throw new Error("The predicted OverlayerWrapBacking address is not valid");
  }

  // Wire staking before the seed deposit so `_compound` is not a no-op at address(0).
  await StakedOverlayerWrap_connectBacking(
    sOverlayerWrapAddr,
    overlayerWrapBackingAddr,
    admin
  );
  console.log(
    `${LOG} [${ts()}] [${
      product.productLabel
    }] StakedOverlayerWrap.overlayerWrapBacking = ${overlayerWrapBackingAddr}`
  );

  const backing = new ethers.Contract(
    overlayerWrapBackingAddr,
    BACKING_ABI,
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
    `${LOG} [${ts()}] [${
      product.productLabel
    }] Approved collateral to OverlayerWrap hash = ${tx.hash}`
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
    `${LOG} [${ts()}] [${
      product.productLabel
    }] Approved OverlayerWrap to StakedOverlayerWrap hash = ${tx.hash}`
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
    overlayerWrapBackingAddress: overlayerWrapBackingAddr,
    backingContract: deployedBacking.contractName
  };
}

// --- Omnichain manifest + multi-product orchestration -----------------------------------------

type ProductMapEntry = {
  vaultSuffix: string;
  decimalsKey: string;
  backingKind?: BackingKind;
};

type BackingKind = "aave" | "gho";

const DEFAULT_MAINNET_OVERLAYER_TO_PRODUCT: Record<string, ProductMapEntry> = {
  OverlayerTether: { vaultSuffix: "T+", decimalsKey: "USDT" },
  OverlayerCircle: { vaultSuffix: "C+", decimalsKey: "USDC" },
  OverlayerUSDG: { vaultSuffix: "G+", decimalsKey: "USDG" },
  OverlayerGHO: { vaultSuffix: "GHO+", decimalsKey: "GHO", backingKind: "gho" }
};

const MAINNET_COLLATERAL_BY_DECIMALS_KEY: Record<
  string,
  { collateral: string; aCollateral: string }
> = {
  USDT: {
    collateral: USDT_ADDRESS,
    aCollateral: AUSDT_ADDRESS
  },
  USDC: {
    collateral: USDC_ADDRESS,
    aCollateral: AUSDC_ADDRESS
  },
  USDG: {
    collateral: USDG_ADDRESS,
    aCollateral: AUSDG_ADDRESS
  },
  GHO: {
    collateral: GHO_ADDRESS,
    aCollateral: SGHO_ADDRESS
  }
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
  const base = { ...DEFAULT_MAINNET_OVERLAYER_TO_PRODUCT };
  const extraPath = process.env.OMNICHAIN_PRODUCT_MAP;
  if (extraPath && fs.existsSync(extraPath)) {
    const extra = JSON.parse(fs.readFileSync(extraPath, "utf8")) as Record<
      string,
      ProductMapEntry
    >;
    Object.assign(base, extra);
  }
  return base;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${LOG} ${name} is required for mainnet post-config`);
  }
  return value;
}

function resolveSharedConfig(): MainnetSharedDeploymentConfig {
  return {
    signerAddr: requireEnv("OMNICHAIN_SIGNER_ADDR"),
    team: requireEnv("OVA_TEAM"),
    safetyModule: requireEnv("OVA_SAFETY_MODULE"),
    buyBack: requireEnv("OVA_BUYBACK")
  };
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
    "eth-mainnet";

  const outputPath = path.resolve(
    (args.output as string) ||
      process.env.OMNICHAIN_MANIFEST_OUT ||
      path.join(
        process.cwd(),
        "mainnet-deployment",
        "mainnet-omnichain-manifest.json"
      )
  );

  const collectOnly =
    args["collect-only"] === true ||
    process.env.OMNICHAIN_COLLECT_ONLY === "1" ||
    process.env.OMNICHAIN_COLLECT_ONLY === "true";

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
      backingContract: string;
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
          `${LOG} Same OverlayerWrap address ${addr} is listed for multiple products: ${prods.join(
            ", "
          )}. Fix omnichain deployment JSONs (each Overlayer*.json should have a unique \`address\`).`
        );
      }
    }

    for (const file of overlayerFiles) {
      const base = file.replace(/\.json$/, "");
      const meta = productMap[base];
      if (!meta) {
        console.warn(
          `${LOG} Skip ${file}: no product map entry (DEFAULT_MAINNET_OVERLAYER_TO_PRODUCT or OMNICHAIN_PRODUCT_MAP)`
        );
        continue;
      }

      const vaultFile = `OVault-${meta.vaultSuffix}.json`;
      const oftJsonPath = path.join(ethPath, file);
      const vaultPath = path.join(ethPath, vaultFile);
      if (!fs.existsSync(vaultPath)) {
        throw new Error(`Expected vault deployment at ${vaultPath}`);
      }

      const coll = MAINNET_COLLATERAL_BY_DECIMALS_KEY[meta.decimalsKey];
      const decimals = ETH_MAINNET_TOKEN_DECIMALS[meta.decimalsKey];
      if (!coll || decimals == null) {
        throw new Error(
          `${LOG} Missing mainnet collateral/decimals config for ${base} (${meta.decimalsKey})`
        );
      }

      const result = await runMainnetOftProductPostConfigure(
        {
          productLabel: base,
          oftOverlayerWrapAddr: readJsonAddress(oftJsonPath),
          stakedOverlayerWrapAddr: readJsonAddress(vaultPath),
          collateralAddress: coll.collateral,
          aCollateralAddress: coll.aCollateral,
          decimals,
          backingKind: meta.backingKind || "aave"
        },
        shared
      );

      contractsRepoDeployments[base] = {
        OvaDispatcher: result.dispatcherAddress,
        OverlayerWrapBacking: result.overlayerWrapBackingAddress,
        backingContract: result.backingContract,
        oftOverlayerWrap: result.oftOverlayerWrapAddr,
        stakedOverlayerWrap: result.stakedOverlayerWrapAddr
      };
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    network: "mainnet",
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
          entry.contractsRepo = contractsRepoDeployments;
        }
        return [folder, entry];
      })
    )
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`${LOG} Wrote manifest: ${outputPath}`);
}

function isExecutedAsHardhatScript(): boolean {
  return process.argv.some((arg) =>
    arg
      .replace(/\\/g, "/")
      .includes("postConfigureMainnetOftFromOmnichainDeployments")
  );
}

if (isExecutedAsHardhatScript()) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
