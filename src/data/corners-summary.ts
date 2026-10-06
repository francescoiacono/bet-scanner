import artifact from "./generated/corners-v07-summary.json";
import type { CornerDatasetSummary } from "../lib/corners/summary";

export interface CornerResearchSummary {
  readonly status: "AVAILABLE";
  readonly schemaVersion: number;
  readonly modelSpecificationSha256: string;
  readonly runtime: { readonly node: string; readonly numeric: string };
  readonly configuration: { readonly promotionRule: string };
  readonly provenance: { readonly sourceName: string; readonly sourcePage: string;
    readonly files: readonly { readonly season: string; readonly localFile: string; readonly sha256: string }[] };
  readonly development: CornerDatasetSummary;
  readonly externalValidation: CornerDatasetSummary;
  readonly preferredModel: string;
}
/** UI imports aggregate JSON only; no private records or numerical optimiser. */
export const cornersSummary = artifact as unknown as CornerResearchSummary;
