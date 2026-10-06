import artifact from "./generated/value-v08-summary.json";
import type { ProfitabilityStatus } from "../lib/value/bootstrap";
import type { VALUE_PROTOCOL } from "../lib/value/config";
import type { ValueCohortSummary } from "../lib/value/summary";

interface ValueSummary {
  readonly schemaVersion: number;
  readonly status: ProfitabilityStatus;
  readonly protocolSha256: string;
  readonly configuration: typeof VALUE_PROTOCOL;
  readonly recent: ValueCohortSummary;
  readonly older: ValueCohortSummary;
  readonly coverage: readonly { readonly seasonId: string; readonly alignedFixtures: number; readonly evaluatedRecords: number; readonly pricedEvaluatedRecords: number; readonly pricedCoverage: number }[];
}
/** Rendering imports only compact aggregates, never the private audit or fitter. */
export const valueSummary = artifact as unknown as ValueSummary;
