import { defineNamespace } from "@/shared/locale/namespaces/define-namespace";
import type { ApplicantLabels } from "@/shared/locale/types/applicant";

export const Applicant = defineNamespace<ApplicantLabels>(
  "applicant.applicant",
  translations => translations.applicantTranslations
);
