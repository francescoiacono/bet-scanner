import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadValueSources, privatePriceUrl } from "./value-sources.mjs";

const { normalized, coverage } = await loadValueSources();
await mkdir(dirname(fileURLToPath(privatePriceUrl)), { recursive: true });
const temporary = new URL(`${privatePriceUrl.href}.tmp`);
await writeFile(temporary, JSON.stringify(normalized, null, 2) + "\n"); await rename(temporary, privatePriceUrl);
for (const row of coverage) console.log(`${row.seasonId}: source hash verified; ${row.alignedFixtures}/380 fixtures aligned with complete Bet365 triplets.`);
console.log("Normalized source prices are private. No models fitted and no profitability calculated.");
