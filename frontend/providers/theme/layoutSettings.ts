import type { MuiThemeLayoutSettings } from "@/frontend/providers/theme/types";

// Configuration values retrieved from DESIGN.md
export const layoutSettings: MuiThemeLayoutSettings = {
  pageMargin: "2rem",
  gutter: "1.5rem",
  authWidth: "420px",
  sidebarWidth: "260px",
  navbarHeight: "64px",
  bottomNavHeight: "64px",
  cardPadding: "1.5rem",
  inputGap: "1rem",
  sectionGap: "1.5rem",
  radius: {
    card: [1, 1.4, 1.8, 2.4],
    button: [1, 1.4, 1.8, 2.4],
    badge: [1, 1.4, 1.8, 2.4],
    section: [1, 1.4, 1.8, 2.4],
  },
};
