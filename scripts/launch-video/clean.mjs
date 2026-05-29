import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

await Promise.all([
  rm(resolve(root, "dist/launch-video"), { force: true, recursive: true }),
  rm(resolve(root, "public/demo-clips"), { force: true, recursive: true }),
]);

console.log("Removed dist/launch-video and public/demo-clips");
