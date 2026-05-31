import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const visionModelId = "Xenova/vit-base-patch16-224";
const tinyMusicianModelId = "itsmax/TinyMusician";
const legacyModelIds = ["Xenova/vit-gpt2-image-captioning"];
const revision = "main";
const wasmOutputDir = join(root, "public", "transformers");
const installTinyMusician = process.argv.includes("--include-tinymusician");

const visionModelFiles = [
  "config.json",
  "preprocessor_config.json",
  "onnx/model_quantized.onnx",
];
const tinyMusicianRootMetadataFiles = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
];

const wasmFiles = [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
];

async function downloadModelFile(modelId, relativePath) {
  const modelOutputDir = join(root, "public", "models", ...modelId.split("/"));
  const outputPath = join(modelOutputDir, relativePath);
  if (existsSync(outputPath)) {
    console.log(`exists ${modelId}/${relativePath}`);
    return;
  }

  const response = await fetch(`https://huggingface.co/${modelId}/resolve/${revision}/${relativePath}`);
  if (!response.ok) {
    throw new Error(`Failed to download ${modelId}/${relativePath}: ${response.status} ${response.statusText}`);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, new Uint8Array(await response.arrayBuffer()));
  console.log(`downloaded ${modelId}/${relativePath}`);
}

async function copyWasmFile(fileName) {
  const sourcePath = join(root, "node_modules", "onnxruntime-web", "dist", fileName);
  const outputPath = join(wasmOutputDir, fileName);
  if (existsSync(outputPath)) {
    console.log(`exists ${fileName}`);
    return;
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);
  console.log(`copied ${fileName}`);
}

await mkdir(wasmOutputDir, { recursive: true });

for (const legacyModelId of legacyModelIds) {
  if (legacyModelId === visionModelId) continue;
  const legacyPath = join(root, "public", "models", ...legacyModelId.split("/"));
  if (existsSync(legacyPath)) {
    await rm(legacyPath, { recursive: true, force: true });
    console.log(`removed legacy model ${legacyModelId}`);
  }
}

for (const file of visionModelFiles) {
  await downloadModelFile(visionModelId, file);
}

for (const file of wasmFiles) {
  await copyWasmFile(file);
}

if (installTinyMusician) {
  const files = await listModelTreeFiles(tinyMusicianModelId);
  if (files.length === 0) {
    throw new Error(`No files found in Hugging Face model tree for ${tinyMusicianModelId}`);
  }

  for (const file of files) {
    await downloadModelFile(tinyMusicianModelId, file);
  }

  await mirrorTinyMusicianRootMetadata();
}

console.log(
  installTinyMusician
    ? "Vision, WASM, and TinyMusician assets installed for local generation."
    : "Vision and WASM assets installed for local analysis. Run npm run music:model:install for TinyMusician.",
);

async function listModelTreeFiles(modelId) {
  const files = [];
  let cursor = null;

  do {
    const url = new URL(`https://huggingface.co/api/models/${modelId}/tree/${revision}`);
    url.searchParams.set("recursive", "1");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to list ${modelId}: ${response.status} ${response.statusText}`);
    }

    const entries = await response.json();
    if (!Array.isArray(entries)) {
      throw new Error(`Unexpected Hugging Face tree response for ${modelId}`);
    }

    files.push(
      ...entries
        .filter((entry) => entry.type === "file" && typeof entry.path === "string")
        .map((entry) => entry.path)
        .filter((path) => !path.endsWith(".md") && path !== ".gitattributes" && !path.endsWith(".DS_Store")),
    );
    cursor = parseNextCursor(response.headers.get("link"));
  } while (cursor);

  return files;
}

function parseNextCursor(linkHeader) {
  if (!linkHeader) return null;
  const nextLink = linkHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.includes('rel="next"'));
  if (!nextLink) return null;
  const match = nextLink.match(/<([^>]+)>/);
  if (!match) return null;
  return new URL(match[1]).searchParams.get("cursor");
}

async function mirrorTinyMusicianRootMetadata() {
  const modelOutputDir = join(root, "public", "models", ...tinyMusicianModelId.split("/"));
  for (const file of tinyMusicianRootMetadataFiles) {
    const sourcePath = join(modelOutputDir, "onnx", file);
    const outputPath = join(modelOutputDir, file);
    if (!existsSync(sourcePath)) {
      throw new Error(`TinyMusician metadata missing after download: onnx/${file}`);
    }
    await copyFile(sourcePath, outputPath);
    console.log(`mirrored ${tinyMusicianModelId}/${file}`);
  }
}
