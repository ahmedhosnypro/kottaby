"use client";

import type { PaletteMode } from "@mui/material/styles";
import type { ReactNode } from "react";
import EmotionCacheProvider from "@/frontend/lib/emotion-cache";
import { AppThemeProvider } from "@/frontend/providers/theme/ThemeProvider";

interface MuiProviderProps {
  readonly children: ReactNode;
  // Server-read theme cookie value; threaded to the AppThemeProvider as
  // `defaultMode` for the cssVars-aware ThemeProvider (prevents SSR flash).
  readonly initialTheme?: PaletteMode;
  readonly nonce?: string;
}

export default function MuiProvider({ children, initialTheme, nonce }: MuiProviderProps) {
  return (
    <EmotionCacheProvider nonce={nonce}>
      <AppThemeProvider initialTheme={initialTheme}>{children}</AppThemeProvider>
    </EmotionCacheProvider>
  );
}
