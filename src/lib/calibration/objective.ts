import { OUTCOMES } from "./config";
import { calibrationLogits, logSumExp, probabilityVector, stableSoftmax } from "./transforms";
import type { CalibrationExample, CalibrationFamily } from "./types";

export function validateExample(example: CalibrationExample): void {
  if (Object.keys(example).some((key) => key !== "probabilities" && key !== "actualOutcome")) throw new RangeError("Calibration fitting accepts probabilities and actual outcome only; metadata/market features forbidden.");
  probabilityVector(example.probabilities);
  if (!OUTCOMES.includes(example.actualOutcome)) throw new RangeError("Invalid calibration outcome.");
}
/** Canonical feature/outcome sorting gives order-invariant fits without identity features. */
export function prepareCalibrationObjective(examples: readonly CalibrationExample[], family: Exclude<CalibrationFamily, "identity">) {
  if (!examples.length || !["temperature-v1", "multinomial-logit-v1"].includes(family)) throw new RangeError("Calibration fitting needs training examples and a fitted family.");
  examples.forEach(validateExample);
  const rows = examples.map((r) => ({ probabilities: { ...r.probabilities }, logs: probabilityVector(r.probabilities).map(Math.log), actual: OUTCOMES.indexOf(r.actualOutcome) }))
    .sort((a, b) => a.probabilities.homeProbability - b.probabilities.homeProbability || a.probabilities.drawProbability - b.probabilities.drawProbability || a.probabilities.awayProbability - b.probabilities.awayProbability || a.actual - b.actual);
  return { trainingRecords: rows.length, evaluate: (parameters: readonly number[]) => {
    let loss = 0; const gradient = Array<number>(family === "temperature-v1" ? 1 : 6).fill(0);
    for (const row of rows) {
      const logits = calibrationLogits(row.probabilities, { family, parameters }), q = probabilityVector(stableSoftmax(logits));
      loss += logSumExp(logits) - logits[row.actual];
      if (family === "temperature-v1") {
        // dL/d(rawT) = z_actual/T − E_q[z/T], since d(z/T)/d(rawT)=−z/T.
        gradient[0] += logits[row.actual] - q.reduce((s, p, i) => s + p * logits[i], 0);
      } else {
        const features = [1, row.logs[0] - row.logs[2], row.logs[1] - row.logs[2]];
        for (let c = 0; c < 2; c++) for (let f = 0; f < 3; f++) gradient[c * 3 + f] += (q[c] - Number(row.actual === c)) * features[f];
      }
    }
    const value = loss / rows.length, meanGradient = gradient.map((g) => g / rows.length);
    if (!Number.isFinite(value) || meanGradient.some((g) => !Number.isFinite(g))) throw new RangeError("Non-finite calibration objective/gradient.");
    return { value, gradient: meanGradient };
  } };
}
