"use client";

import { useMediaQuery, useTheme } from "@mui/material";
import { type ReactNode, useMemo } from "react";
import { ViewportContext, type ViewportContextType, type ViewportTier } from "@/frontend/context/ViewportContext";

interface ViewportProviderProps {
  readonly children: ReactNode;
  /**
   * Forces a specific viewport tier instead of detecting it via `useMediaQuery`.
   * Tests use this to simulate a specific tier without resizing the window.
   * When omitted, the tier is detected from the current MUI breakpoints.
   */
  readonly viewport?: ViewportTier;
}

function tierToContext(tier: ViewportTier): ViewportContextType {
  return {
    tier,
    isMobile: tier === "mobile" || tier === "tablet", // down("md") equivalent
    isTablet: tier === "tablet",
    isDesktop: tier === "desktop",
  };
}

export function ViewportProvider({ children, viewport }: ViewportProviderProps) {
  const theme = useTheme();

  // MUI default breakpoints: sm=600, md=900, lg=1200, xl=1536
  // Tier: mobile (<600), tablet (600-900), desktop (>=900)
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "md"), { noSsr: true });

  const value = useMemo<ViewportContextType>(() => {
    if (viewport) {
      return tierToContext(viewport);
    }
    let detected: ViewportTier;
    if (isMobile) {
      detected = "mobile";
    } else if (isTablet) {
      detected = "tablet";
    } else {
      detected = "desktop";
    }
    return tierToContext(detected);
  }, [viewport, isMobile, isTablet]);

  return <ViewportContext.Provider value={value}>{children}</ViewportContext.Provider>;
}
