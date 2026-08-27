"use client";

import { useCallback, useEffect, useState } from "react";

// NEW FOR PLAN v5: migrated hook from frontend/common/components/ui/input/localizedString/useLocaleSwitchSuccess.ts
//   to frontend/common/hooks/ to satisfy specs.md §2.4 allowlist —
//   @/frontend/hooks/** is the only hooks allowlist for tier imports.

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
