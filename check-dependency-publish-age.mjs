#!/usr/bin/env node
/**
 * Run before installs: npm run install-safe (or npm run check-publish-age && npm install).
 *
 * Reads package-lock.json, checks tarball publish times from registry.npmjs.org
 * against MIN_PACKAGE_AGE_DAYS (default 7). Use MIN_PACKAGE_AGE_DAYS=0 to disable the age rule.
 *
 * Env: MIN_PACKAGE_AGE_DAYS, CHECK_PUBLISH_AGE_CONCURRENCY (parallel fetches, default 12).
 * Args: --days N  (alternative to MIN_PACKAGE_AGE_DAYS)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "./");
const NPM_REGISTRY_ORIGIN = "https://registry.npmjs.org/";
const MARKER = "node_modules/";

class RegistryHttpError extends Error {
  /** @param {string} pkgName @param {number} status */
  constructor(pkgName, status) {
    super(`registry ${pkgName}: HTTP ${status}`);
    this.pkgName = pkgName;
    this.statusCode = status;
  }
}

function packageNameFromLockKey(lockKey) {
  if (!lockKey || lockKey === "") return null;
  const idx = lockKey.lastIndexOf(MARKER);
  if (idx === -1) return null;
  return lockKey.slice(idx + MARKER.length);
}

function collectLockedRegistryPackages(lock) {
  /** @type {Map<string, { name: string; version: string; resolved: string }>} */
  const byKey = new Map();
  const packages = lock.packages || {};
  for (const [lockKey, meta] of Object.entries(packages)) {
    if (!meta || typeof meta.version !== "string") continue;
    const resolved =
      typeof meta.resolved === "string" ? meta.resolved.trim() : "";
    if (!resolved.startsWith(`${NPM_REGISTRY_ORIGIN}`)) continue;

    const name =
      typeof meta.name === "string" && meta.name.length > 0
        ? meta.name
        : packageNameFromLockKey(lockKey);
    if (!name) continue;

    const dedupe = `${name}@${meta.version}`;
    byKey.set(dedupe, {
      name,
      version: meta.version,
      resolved,
    });
  }
  return [...byKey.values()];
}

async function pooled(items, concurrency, fn) {
  if (items.length === 0) return;
  const workers = concurrency;
  let next = 0;
  async function worker() {
    while (true) {
      const j = next++;
      if (j >= items.length) break;
      await fn(items[j]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, () => worker()));
}

/** @type {Map<string, any>} */
const packumentCache = new Map();

async function fetchPublishTime(pkgName, version) {
  let doc = packumentCache.get(pkgName);
  if (!doc) {
    const url = `${NPM_REGISTRY_ORIGIN}${encodeURIComponent(pkgName)}`;
    const res = await fetch(url);
    if (res.status === 404) throw new RegistryHttpError(pkgName, 404);
    if (!res.ok) throw new Error(`registry ${pkgName}: HTTP ${res.status}`);
    doc = await res.json();
    packumentCache.set(pkgName, doc);
  }
  const raw = doc?.time?.[version];
  return raw ? new Date(raw).getTime() : null;
}

function parseMinDays() {
  const env = process.env.MIN_PACKAGE_AGE_DAYS;
  if (env != null && env !== "") {
    const n = Number(env);
    return Number.isFinite(n) ? n : NaN;
  }
  const idx = process.argv.indexOf("--days");
  if (idx !== -1) {
    const v = process.argv[idx + 1];
    const n = v != null ? Number(v) : NaN;
    return Number.isFinite(n) ? n : NaN;
  }
  return 7;
}

async function main() {
  const minDays = parseMinDays();
  if (!Number.isFinite(minDays) || minDays < 0) {
    console.error("Invalid MIN_PACKAGE_AGE_DAYS or --days argument");
    process.exit(2);
  }
  const msMin = minDays * 86400_000;
  const concurrency = Number(process.env.CHECK_PUBLISH_AGE_CONCURRENCY || 12);

  const lockPath = path.join(ROOT, "package-lock.json");
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    console.error("Missing or unreadable package-lock.json at repo root.");
    process.exit(2);
  }
  if ((lock.lockfileVersion ?? 0) < 2) {
    console.error(
      "This script expects npm lockfile v2+. Run npm install once to refresh package-lock.json."
    );
    process.exit(2);
  }

  const entries = collectLockedRegistryPackages(lock);
  console.log(
    `check-publish-age: ${entries.length} unique registry packages (minimum age ${minDays}d)\n`
  );

  /** @type {string[]} */
  const tooNew = [];

  /** @type {string[]} */
  const missingExamples = [];
  let missingPublishTimeCount = 0;

  await pooled(entries, concurrency, async ({ name, version }) => {
    let publishedMs;
    try {
      publishedMs = await fetchPublishTime(name, version);
    } catch (e) {
      if (e instanceof RegistryHttpError && e.statusCode === 404) {
        console.warn(`Registry 404 ${name}@${version} (skipped).`);
      } else {
        console.error(`fetch failed ${name}@${version}: ${e}`);
        throw e;
      }
      return;
    }
    if (publishedMs === null || Number.isNaN(publishedMs)) {
      missingPublishTimeCount += 1;
      if (missingExamples.length < 12) missingExamples.push(`${name}@${version}`);
      return;
    }
    const ageMs = Date.now() - publishedMs;
    if (msMin > 0 && ageMs < msMin) {
      const ageDh = Math.round((ageMs / 86400_000) * 10) / 10;
      tooNew.push(
        `${name}@${version} (published ~${ageDh}d ago, requires ${minDays}d)`
      );
    }
  });

  if (missingPublishTimeCount > 0) {
    console.warn(
      `\nNotice: ${missingPublishTimeCount} package(s) have no publication timestamp in npm metadata (skipped). Samples:\n` +
        missingExamples.map((line) => `  - ${line}`).join("\n") +
        (missingExamples.length < missingPublishTimeCount
          ? "\n  - …"
          : "") +
        "\nVerify these manually before trusting the install.\n"
    );
  }

  if (tooNew.length) {
    console.error(
      `\nBlocked: ${tooNew.length} package(s) are newer than ${minDays} days:\n\n` +
        tooNew.map((line) => `  - ${line}`).join("\n") +
        "\n\nInstall once they meet the cooldown, or temporarily override with MIN_PACKAGE_AGE_DAYS=0 .\n"
    );
    process.exit(1);
  }

  console.log(
    "All examined registry tarball versions satisfy the publish-age rule.\n"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
