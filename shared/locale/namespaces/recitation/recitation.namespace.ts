import { defineNamespace } from "@/shared/locale/namespaces/define-namespace";
import type { RecitationLabels } from "@/shared/locale/types/recitation";

export const Recitation = defineNamespace<RecitationLabels>(
  "recitation.recitation",
  translations => translations.recitationTranslations
);
