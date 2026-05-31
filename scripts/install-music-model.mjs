import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelId = "Xenova/vit-base-patch16-224";
const legacyModelIds = ["Xenova/vit-gpt2-image-captioning"];
const revision = "main";
const modelBaseUrl = `https://huggingface.co/${modelId}/resolve/${revision}`;
const modelOutputDir = join(root, "public", "models", ...modelId.split("/"));
const wasmOutputDir = join(root, "public", "transformers");

const modelFiles = [
  "config.json",
  "preprocessor_config.json",
  "onnx/model_quantized.onnx",
];

const wasmFiles = [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
];

async function downloadFile(relativePath) {
  const outputPath = join(modelOutputDir, relativePath);
  if (existsSync(outputPath)) {
    console.log(`exists ${relativePath}`);
    return;
  }

  const response = await fetch(`${modelBaseUrl}/${relativePath}`);
  if (!response.ok) {
    throw new Error(`Failed to download ${relativePath}: ${response.status} ${response.statusText}`);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, new Uint8Array(await response.arrayBuffer()));
  console.log(`downloaded ${relativePath}`);
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

await mkdir(modelOutputDir, { recursive: true });
await mkdir(wasmOutputDir, { recursive: true });

for (const legacyModelId of legacyModelIds) {
  if (legacyModelId === modelId) continue;
  const legacyPath = join(root, "public", "models", ...legacyModelId.split("/"));
  if (existsSync(legacyPath)) {
    await rm(legacyPath, { recursive: true, force: true });
    console.log(`removed legacy model ${legacyModelId}`);
  }
}

for (const file of modelFiles) {
  await downloadFile(file);
}

for (const file of wasmFiles) {
  await copyWasmFile(file);
}

console.log("Music model assets installed for local generation.");
