import { defineNamespace } from "@/shared/locale/namespaces/define-namespace";
import type { CommonLabels } from "@/shared/locale/types/common";

export const Common = defineNamespace<CommonLabels>("common.common", translations => translations.commonTranslations);
