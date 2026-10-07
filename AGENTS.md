<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Bet Scanner project rules

- This application is a betting research scanner, not a bet execution system.
- Do not add bet placement, staking, bankroll, deposit, withdrawal, or bookmaker-account functionality unless explicitly requested.
- Keep market/provider data separate from model predictions.
- Keep betting/statistical calculations outside React components.
- Core calculations should be pure functions wherever practical.
- Core calculations require unit tests.
- Invalid statistical or market inputs must fail explicitly rather than producing plausible-looking output.
- Do not silently change mathematical formulas, thresholds, ranking rules, or modelling assumptions.
- Model assumptions and limitations must be documented.
- Avoid adding dependencies or infrastructure unless the current milestone requires them.
- Prefer small, testable modules over large abstractions.
- Do not add AI simply because a judgement could be made by AI; deterministic logic remains the default.
- Backtests must be time-causal: a prediction may use only data with a kickoff time strictly earlier than the target match.
- Matches sharing the same kickoff time must not influence one another.
- Changing a future result must never change an earlier backtest prediction.
- Do not modify a model while implementing the framework used to evaluate that model unless explicitly requested.
- Add focused tests for new behaviour and important invariants; do not increase test count merely for its own sake.
- Real-data evaluations must record dataset provenance and the exact seasons evaluated.
- Evaluation seasons must not share model history unless a milestone explicitly introduces cross-season carryover.
- Real-data ingestion must be reproducible from committed source data or a documented deterministic acquisition step.
- Generated/normalized datasets must never silently drop malformed source matches.
- Benchmark predictions must obey the same causal information boundary as the model being evaluated.
- Diagnostic milestones must not tune a frozen model using the same evaluation data unless explicitly scoped as a new model version.
- Statistical uncertainty outputs must be deterministic and reproducible from an explicit seed and method.
- Comparisons between models or benchmarks must use paired outcomes from the same evaluated matches.
- Uncertainty intervals are diagnostics, not proof of statistical or betting significance.
- Diagnostic slices must be defined independently of their observed performance; do not invent post-hoc buckets to make results look stronger.
- Named model versions are immutable once used for recorded evaluation results.
- New models must be evaluated on the same eligible matches as their baseline when making paired comparisons.
- External-validation data must not be used to tune or alter the model within the milestone that first evaluates it.
- Numerical optimisation must be deterministic from deterministic inputs.
- Optimisation failures must fail explicitly; never silently fall back to another model or stale parameters.
- Model fitting must obey the same causal boundary as prediction: target-date results may never enter target-date fitting.
- General-purpose numerical optimisation algorithms should use a small, established library rather than being reimplemented without a strong reason.
- Private/local source datasets must never be committed when redistribution rights are unclear or intentionally restricted.
- Unused market-price columns in source files must not leak into model inputs.
- Count-model distribution truncation must retain tail probability explicitly.
- Model-selection criteria must be specified before external-validation results are viewed.
- Different proper scoring-rule definitions must not be compared as though their numeric scales were interchangeable.
- Market prices used for evaluation must never enter statistical model fitting unless explicitly scoped as a market-informed model.
- Historical price backtests must separate selection from settlement so realised outcomes cannot influence selection.
- Paper-strategy thresholds must be specified before profitability results are viewed.
- Better proper scores do not establish betting profitability; historical profitability does not establish future profitability.
- Primary market-price evaluations must use a consistent documented price definition; never silently mix opening, interim, and closing prices.
- Missing bookmaker prices must not be silently replaced by another bookmaker in a frozen protocol.
- Research profitability tests default to flat unit stakes unless staking is separately scoped.
- Calibration layers must be versioned separately from the underlying statistical model.
- Market prices must never fit a probability calibrator unless a milestone explicitly defines a market-informed model.
- Calibration-family selection and parameter fitting must remain separate from final validation data.
- Calibration transforms must be evaluated on predictions not used to fit those transforms.
- Calibration diagnostics must distinguish sharpness from accuracy and proper scoring performance.
- Market disagreement is a benchmark diagnostic, not evidence of betting value.
- Do not promote a calibrated model solely because it reduces disagreement with bookmaker prices.
