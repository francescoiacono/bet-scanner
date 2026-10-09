import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OddsMode } from "../lib/odds/types";
import { useFreeDiscovery } from "./use-free-discovery";

const hooks = vi.hoisted(() => ({ useEffect: vi.fn(), useRef: vi.fn() }));
vi.mock("react", () => ({ useEffect: hooks.useEffect, useRef: hooks.useRef }));

beforeEach(() => {
  hooks.useEffect.mockReset();
  hooks.useRef.mockReset().mockReturnValue({ current: false });
});

// Execute the registered effect explicitly: no DOM, provider or real HTTP needed.
function useDiscoveryEffect(mode: OddsMode, configured: boolean, discover: () => Promise<void>) {
  useFreeDiscovery(mode, configured, discover);
  const effect = hooks.useEffect.mock.calls.at(-1)![0] as () => void;
  effect();
  return effect;
}

describe("automatic free discovery", () => {
  it.each([["DEMO", true], ["DEMO", false], ["LIVE", false]] as const)("does not discover in %s with configured=%s", (mode, configured) => {
    const discover = vi.fn(async () => {});
    useDiscoveryEffect(mode, configured, discover);
    expect(discover).not.toHaveBeenCalled();
  });
  it("waits for hydration and makes one free attempt despite Strict Mode effect replay", () => {
    const discover = vi.fn(async () => {});
    useFreeDiscovery("LIVE", true, discover);
    expect(discover).not.toHaveBeenCalled();
    const effect = hooks.useEffect.mock.calls[0][0] as () => void;
    effect(); effect();
    expect(discover).toHaveBeenCalledTimes(1);
  });
  it("does not repeat discovery when callbacks change or the user switches modes", async () => {
    const discover = vi.fn(async () => {}), changedCallback = vi.fn(async () => {});
    useDiscoveryEffect("LIVE", true, discover);
    await discover.mock.results[0].value;
    useDiscoveryEffect("LIVE", true, changedCallback);
    useDiscoveryEffect("DEMO", true, changedCallback);
    useDiscoveryEffect("LIVE", true, changedCallback);
    expect(discover).toHaveBeenCalledTimes(1); expect(changedCallback).not.toHaveBeenCalled();
  });
  it("allows a later LIVE configuration to make its first attempt", () => {
    const discover = vi.fn(async () => {});
    useDiscoveryEffect("DEMO", true, discover);
    useDiscoveryEffect("LIVE", false, discover);
    useDiscoveryEffect("LIVE", true, discover);
    expect(discover).toHaveBeenCalledTimes(1);
  });
  it("a new page mount can make a new free attempt", () => {
    const discover = vi.fn(async () => {});
    useDiscoveryEffect("LIVE", true, discover);
    hooks.useRef.mockReturnValue({ current: false });
    useDiscoveryEffect("LIVE", true, discover);
    expect(discover).toHaveBeenCalledTimes(2);
  });
});
