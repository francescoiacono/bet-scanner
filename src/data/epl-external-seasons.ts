import seasons from "./generated/epl-external-seasons.json";
import provenance from "../../data/external/openfootball/external-validation-provenance.json";
import type { HistoricalSeason } from "../lib/backtest/types";

export const externalEplSeasons = seasons as readonly HistoricalSeason[];
export const externalEplProvenance = provenance;
