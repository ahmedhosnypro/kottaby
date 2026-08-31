"use client";
import type { PaletteMode } from "@mui/material/styles";
import { createContext } from "react";

export interface ThemeContextType {
  readonly mode: PaletteMode;
  readonly toggleTheme: () => void;
  readonly isThemeChanging: boolean;
  readonly setIsThemeChanging: (loading: boolean) => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
