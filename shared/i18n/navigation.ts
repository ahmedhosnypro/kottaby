"use client";

import { usePathname as useNextPathname, useRouter as useNextRouter } from "next/navigation";

export interface AppRouter {
  push(href: string, options?: { scroll?: boolean }): void;
  replace(href: string, options?: { scroll?: boolean }): void;
  back(): void;
  forward(): void;
  refresh(): void;
  prefetch(href: string): void;
}

export function usePathname(): string {
  return useNextPathname();
}

export function useRouter(): AppRouter {
  return useNextRouter();
}
