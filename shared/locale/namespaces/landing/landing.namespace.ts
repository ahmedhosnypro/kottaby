import { defineNamespace } from "@/shared/locale/namespaces/define-namespace";
import type { LandingLabels } from "@/shared/locale/types/landing";

export const Landing = defineNamespace<LandingLabels>(
  "landing.landing",
  translations => translations.landingTranslations
);
