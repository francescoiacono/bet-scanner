import { registerHooks } from "node:module";

// Node's native TS stripping needs explicit extensions; retain the existing
// Next.js/Vitest import style without adding a runtime loader dependency.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith(".ts") && specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
} });
