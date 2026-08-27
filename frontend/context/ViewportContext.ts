"use client";

/**
 * Viewport tier context — mobile / tablet / desktop.
 *
 * Provided by `ViewportProvider` (which detects the tier via MUI
 * `useMediaQuery` against the theme breakpoints). Consumed by layout hooks
 * and components that need to switch between mobile/desktop variants without
 * each calling `useMediaQuery` independently (avoids N breakpoint
 * subscriptions).
 */
import { createContext } from "react";

/** Coarse viewport tiers derived from MUI breakpoints. */
export type ViewportTier = "mobile" | "tablet" | "desktop";

/** Shape stored in `ViewportContext`. */
export interface ViewportContextType {
  /** The active tier (`mobile` < 600px, `tablet` 600–900px, `desktop` ≥ 900px). */
  readonly tier: ViewportTier;
  /** `true` when tier is mobile OR tablet (i.e. `breakpoints.down("md")`). */
  readonly isMobile: boolean;
  /** `true` only when tier is tablet. */
  readonly isTablet: boolean;
  /** `true` only when tier is desktop. */
  readonly isDesktop: boolean;
}

export const ViewportContext = createContext<ViewportContextType | undefined>(undefined);
