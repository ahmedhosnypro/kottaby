import { DarkModeOutlined, LightModeOutlined } from "@mui/icons-material";
import { Button } from "@mui/material";
import type { ReactNode } from "react";

/** Dark/light mode toggle — rendered in both the desktop and mobile header rows. */
export function ColorModeToggleButton({
  mode,
  onToggle,
  ariaLabel,
}: Readonly<{ mode: string | undefined; onToggle: () => void; ariaLabel: string }>): ReactNode {
  return (
    <Button
      onClick={onToggle}
      sx={{
        minWidth: "auto",
        p: 1,
        color: "var(--mui-palette-secondary-light)",
        borderRadius: 2,
        "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 15%, transparent)" },
      }}
      aria-label={ariaLabel}
    >
      {mode === "dark" ? <LightModeOutlined /> : <DarkModeOutlined />}
    </Button>
  );
}
