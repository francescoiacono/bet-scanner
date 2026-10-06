import artifact from "./generated/model-comparison-v06.json";
import type { DatasetComparison } from "../lib/model-comparison/types";

/** Offline results only: this import graph never loads the numerical fitter. */
export const modelComparison = artifact as unknown as {
  readonly modelSpecificationSha256: string;
  readonly runtime: { readonly node: string; readonly numeric: string };
  readonly development: DatasetComparison;
  readonly externalValidation: DatasetComparison;
};
