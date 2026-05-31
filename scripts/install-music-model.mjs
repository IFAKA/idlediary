import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BasicSoundBank } from "spessasynth_core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const visionModelId = "Xenova/mobilevit-small";
const legacyModelIds = ["Xenova/vit-base-patch16-224", "Xenova/vit-gpt2-image-captioning"];
const revision = "main";
const wasmOutputDir = join(root, "public", "transformers");
const spessaOutputDir = join(root, "public", "spessasynth");
const soundFontOutputPath = join(root, "public", "soundfonts", "lofi-diary.sf2");

const visionModelFiles = [
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

async function copySpessaWorklet() {
  const fileName = "spessasynth_processor.min.js";
  const sourcePath = join(root, "node_modules", "spessasynth_lib", "dist", fileName);
  const outputPath = join(spessaOutputDir, fileName);
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);
  console.log(`copied ${fileName}`);
}

async function writeLocalSoundFont() {
  if (existsSync(soundFontOutputPath)) {
    console.log("exists lofi-diary.sf2");
    return;
  }

  await mkdir(dirname(soundFontOutputPath), { recursive: true });
  await writeFile(soundFontOutputPath, Buffer.from(BasicSoundBank.getSampleSoundBankFile()));
  console.log("wrote lofi-diary.sf2");
}

await mkdir(wasmOutputDir, { recursive: true });
await mkdir(spessaOutputDir, { recursive: true });

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

await copySpessaWorklet();
await writeLocalSoundFont();

console.log("Vision, WASM, and SpessaSynth assets installed for local analysis and generation.");
