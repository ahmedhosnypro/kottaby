// Re-export the locale context object and hooks from `@/shared/locale`
// so frontend consumers can depend on a stable frontend import path while keeping
// the Fast Refresh surface of `LocaleProvider.tsx` component-only.
export {
  LocaleContext,
  type LocaleContextValue,
  useAppLocale,
  useLocaleContext,
} from "@/shared/locale";
