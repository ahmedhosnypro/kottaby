import { defineNamespace } from "@/shared/locale/namespaces/define-namespace";
import type { ErrorsLabels } from "@/shared/locale/types/errors";

export const Errors = defineNamespace<ErrorsLabels>("errors.errors", translations => translations.errorsTranslations);
