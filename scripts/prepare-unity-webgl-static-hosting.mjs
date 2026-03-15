import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";

const distRoot = path.resolve(process.argv[2] ?? "apps/web/dist");
const unityRoot = path.join(distRoot, "unity-webgl");
const buildRoot = path.join(unityRoot, "Build");
const indexPath = path.join(unityRoot, "index.html");

async function decompressFile(sourcePath, targetPath) {
  const sourceName = path.basename(sourcePath);
  const targetDir = path.dirname(targetPath);
  fs.mkdirSync(targetDir, { recursive: true });

  const decoder = sourceName.endsWith(".br")
    ? zlib.createBrotliDecompress()
    : zlib.createGunzip();

  await pipeline(
    fs.createReadStream(sourcePath),
    decoder,
    fs.createWriteStream(targetPath),
  );
}

async function main() {
  if (!fs.existsSync(indexPath) || !fs.existsSync(buildRoot)) {
    console.log(`[unity-static] skipped; no Unity WebGL export at ${unityRoot}`);
    return;
  }

  const buildEntries = fs.readdirSync(buildRoot);
  const compressedEntries = buildEntries.filter(
    (entry) => entry.endsWith(".gz") || entry.endsWith(".br"),
  );

  if (compressedEntries.length === 0) {
    console.log(`[unity-static] skipped; no compressed Unity assets found in ${buildRoot}`);
    return;
  }

  let html = fs.readFileSync(indexPath, "utf8");

  for (const entry of compressedEntries) {
    const sourcePath = path.join(buildRoot, entry);
    const targetName = entry.replace(/\.(gz|br)$/u, "");
    const targetPath = path.join(buildRoot, targetName);

    await decompressFile(sourcePath, targetPath);
    html = html.replaceAll(entry, targetName);
    console.log(`[unity-static] unpacked ${entry} -> ${targetName}`);
  }

  fs.writeFileSync(indexPath, html);
  console.log(`[unity-static] rewrote ${indexPath} to use unpacked Unity assets`);
}

await main();
