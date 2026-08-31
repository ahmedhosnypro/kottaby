import { defineNamespace } from "@/shared/locale/namespaces/define-namespace";
import type { AuthLabels } from "@/shared/locale/types/auth";

export const Auth = defineNamespace<AuthLabels>("auth.auth", translations => translations.authTranslations);
