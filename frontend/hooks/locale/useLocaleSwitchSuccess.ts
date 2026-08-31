"use client";

import { useCallback, useEffect, useState } from "react";

// Hooks tier-allowlist note: `@/frontend/hooks/**` is the only hooks
// allowlist for tier imports, so this hook lives here rather than beside the
// input component that consumes it.

/**
 * Hook that drives a 500ms green-tint flash after a successful locale switch.
 *
 * Caller calls `triggerSuccess()` after committing the Kottaby and after the
 * input settled without error. Returns the `successSwitch` flag to pass to
 * `LocaleAdornmentSwitch` (or to the parent `TextField` `sx`)
 * and auto-resets after 500ms.
 *
 * Lives in its own file so `LocaleAdornmentSwitch.tsx` can keep exporting
 * only the component (keeps `react-refresh/only-export-components` happy).
 */
export function useLocaleSwitchSuccess(): {
  readonly successSwitch: boolean;
  readonly triggerSuccess: () => void;
} {
  const [successSwitch, setSuccessSwitch] = useState(false);

  useEffect(() => {
    if (!successSwitch) {
      return undefined;
    }
    const id = setTimeout(() => setSuccessSwitch(false), 500);
    return () => clearTimeout(id);
  }, [successSwitch]);

  const triggerSuccess = useCallback(() => setSuccessSwitch(true), []);
  return { successSwitch, triggerSuccess };
}
