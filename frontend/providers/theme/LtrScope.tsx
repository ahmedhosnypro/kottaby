"use client";

import { CacheProvider } from "@emotion/react";
import Box from "@mui/material/Box";
import { createTheme, ThemeProvider, useTheme } from "@mui/material/styles";
import { type ReactNode, useMemo } from "react";
import { getLtrEmotionCache } from "@/frontend/lib/emotion-ltr-cache";

type LtrScopeProps = {
  readonly children: ReactNode;
};

/**
 * Forces LTR layout for MUI children inside an RTL page (e.g. Arabic locale).
 * Uses a dedicated Emotion cache (no RTL stylis plugin), nested theme direction,
 * and the HTML `dir` attribute so physical spacing is not flipped.
 */
export function LtrScope({ children }: LtrScopeProps): ReactNode {
  const theme = useTheme();
  const ltrTheme = useMemo(() => createTheme(theme, { direction: "ltr" }), [theme]);

  return (
    <CacheProvider value={getLtrEmotionCache()}>
      <ThemeProvider theme={ltrTheme}>
        <Box dir="ltr">{children}</Box>
      </ThemeProvider>
    </CacheProvider>
  );
}
