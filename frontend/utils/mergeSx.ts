import type { SxProps, Theme } from "@mui/material/styles";
import type { SystemStyleObject } from "@mui/system/styleFunctionSx";

type SxArrayItem = boolean | SystemStyleObject<Theme> | ((theme: Theme) => SystemStyleObject<Theme>);

export function mergeSx(...styles: Array<SxProps<Theme> | undefined>): SxProps<Theme> {
  const defined = styles.filter((style): style is SxProps<Theme> => style != null);
  const items: SxArrayItem[] = [];
  collectSxItems(items, defined);
  return items;
}

function collectSxItems(items: SxArrayItem[], styles: readonly (SxArrayItem | readonly SxArrayItem[])[]): void {
  for (const style of styles) {
    if (typeof style === "boolean") {
      items.push(style);
    } else if (typeof style === "function") {
      items.push(style);
    } else if (isReadonlyArray(style)) {
      collectSxItems(items, style);
    } else {
      items.push(style);
    }
  }
}

function isReadonlyArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
