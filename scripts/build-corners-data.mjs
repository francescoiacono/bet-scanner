import { mkdir, rename, writeFile } from "node:fs/promises";
import { cornerManifestUrl, loadCornerSources, projectRoot } from "./corner-sources.mjs";

const { manifest, isNew, datasets } = await loadCornerSources({ allowNewManifest: true });
await mkdir(new URL("data/private/generated/", projectRoot), { recursive: true });
const output = new URL("data/private/generated/epl-corners-v07.json", projectRoot);
await writeFile(new URL(`${output.href}.tmp`), JSON.stringify(datasets, null, 2) + "\n");
await rename(new URL(`${output.href}.tmp`), output);
if (isNew) {
  await mkdir(new URL("data/provenance/", projectRoot), { recursive: true });
  await writeFile(cornerManifestUrl, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Established metadata-only provenance after validating all ten seasons:");
  manifest.files.forEach((file) => console.log(`${file.localFile}: ${file.sha256}`));
}
console.log("Verified ten local source hashes; 3,800 matches; every season has 380 matches / 20 teams / 19 home and 19 away fixtures per team. Normalized rows remain private.");
