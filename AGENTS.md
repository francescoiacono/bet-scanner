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
