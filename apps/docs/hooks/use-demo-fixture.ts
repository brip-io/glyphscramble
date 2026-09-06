"use client";

import { useCallback, useState } from "react";
import {
  demoData,
  type DeliveryMode,
  type DemoFixture,
  type VariantKey,
} from "../lib/demo-fixtures";

export interface DemoFixtureSelection {
  readonly mode: DeliveryMode;
  readonly variant: VariantKey;
  readonly fixture: DemoFixture;
  /** The other variant of the same delivery mode, for side-by-side claims. */
  readonly alternate: DemoFixture;
  selectMode(mode: DeliveryMode): void;
  selectVariant(variant: VariantKey): void;
}

/** Owns which generated fixture the explorer is currently showing. */
export function useDemoFixture(): DemoFixtureSelection {
  const [mode, setMode] = useState<DeliveryMode>("runtime");
  const [variant, setVariant] = useState<VariantKey>("a");

  const selectMode = useCallback((next: DeliveryMode) => {
    setMode(next);
    setVariant("a");
  }, []);

  return {
    mode,
    variant,
    fixture: demoData[mode][variant],
    alternate: demoData[mode][variant === "a" ? "b" : "a"],
    selectMode,
    selectVariant: setVariant,
  };
}
