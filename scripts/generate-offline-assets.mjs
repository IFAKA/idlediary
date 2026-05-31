import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const publicDir = join(root, "public");
const nextStaticDir = join(root, ".next", "static");
const outputPath = join(publicDir, "offline-assets.json");
const buildIdPath = join(root, ".next", "BUILD_ID");

const excludedPublicPaths = new Set(["/sw.js", "/offline-assets.json"]);
const lazyPublicPathPrefixes = ["/ffmpeg/", "/models/", "/transformers/"];
const appRoutes = ["/", "/videos", "/draft", "/result", "/demo/launch"];

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walkFiles(path);
      if (entry.isFile()) return [path];
      return [];
    }),
  );
  return files.flat();
}

function toUrl(prefix, baseDir, file) {
  return `${prefix}/${relative(baseDir, file).split(sep).join("/")}`;
}

async function readBuildStaticAssets() {
  if (!(await fileExists(nextStaticDir))) return [];
  const files = await walkFiles(nextStaticDir);
  return files
    .filter((file) => !file.endsWith(".map"))
    .map((file) => toUrl("/_next/static", nextStaticDir, file));
}

async function readPublicAssets() {
  const files = await walkFiles(publicDir);
  return files
    .map((file) => toUrl("", publicDir, file))
    .filter(
      (asset) =>
        !excludedPublicPaths.has(asset) &&
        !lazyPublicPathPrefixes.some((prefix) => asset.startsWith(prefix)),
    );
}

async function readBuildId() {
  try {
    return (await readFile(buildIdPath, "utf8")).trim();
  } catch {
    return null;
  }
}

const assets = [...new Set([...appRoutes, ...(await readPublicAssets()), ...(await readBuildStaticAssets())])].sort();
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      revision: process.env.NEXT_PUBLIC_OFFLINE_CACHE_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA ?? (await readBuildId()),
      assets,
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${assets.length} offline assets to ${relative(root, outputPath)}`);
