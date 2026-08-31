import type { Components, Theme } from "@mui/material/styles";
import {
  getMuiButton,
  getMuiCard,
  getMuiCssBaseline,
  getMuiDataGrid,
  getMuiInputOverrides,
  getMuiPaper,
  getMuiSwitch,
  getMuiTypography,
} from "@/frontend/providers/theme/overrides";

export const components = (): Components<Omit<Theme, "components">> => {
  return {
    MuiCssBaseline: getMuiCssBaseline(),
    MuiButton: getMuiButton(),
    MuiPaper: getMuiPaper(),
    MuiCard: getMuiCard(),
    MuiSwitch: getMuiSwitch(),
    MuiTypography: getMuiTypography(),
    ...getMuiInputOverrides(),
    MuiDataGrid: getMuiDataGrid(),
  };
};
