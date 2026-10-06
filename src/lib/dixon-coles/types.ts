import type { ExpectedGoals, OutcomeProbabilities } from "../football/types";

export interface TeamRating {
  readonly team: string;
  readonly attack: number;
  readonly defenceWeakness: number;
}

export interface DixonColesParameters {
  readonly teams: readonly TeamRating[];
  readonly homeAdvantage: number;
  readonly rho: number;
}

export interface DixonColesPrediction extends ExpectedGoals, OutcomeProbabilities {
  readonly fixtureId: string;
  readonly rho: number;
  readonly modelVersion: "dixon-coles-v1";
}

export interface DixonColesFit extends DixonColesParameters {
  readonly modelVersion: "dixon-coles-v1";
  readonly trainingMatchCount: number;
  readonly teamCount: number;
  readonly converged: true;
  readonly iterations: number;
  readonly evaluations: number;
  readonly rejectedTrials: number;
  readonly negativeLogLikelihood: number;
  readonly meanGradientNorm: number;
  readonly termination: string;
  readonly convergenceCriterion: "GRADIENT_NORM" | "RELATIVE_OBJECTIVE" | "STEP_TOLERANCE";
  readonly rawParameters: readonly number[];
}

export interface FitOptions {
  readonly maximumIterations?: number;
}
