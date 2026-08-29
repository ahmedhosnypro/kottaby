/**
 * Shared recitation label + description mapping.
 *
 * Extracted from RecitationSelector.tsx + ProfileView.tsx to eliminate
 * jscpd duplicates. Maps a `RecitationReading` enum value to its translated
 * display label and short description.
 */
import { RecitationReading } from "@/frontend/graphql/generated/gql/graphql";
import type { RecitationLabels } from "@/shared/locale/types/recitation";

export function getRecitationLabel(reading: RecitationReading, t: RecitationLabels): string {
  switch (reading) {
    case RecitationReading.HafsAnAsim:
      return t.hafsAnAsim;
    case RecitationReading.WarshAnNafi:
      return t.warshAnNafi;
    case RecitationReading.QalunAnNafi:
      return t.qalunAnNafi;
    case RecitationReading.AlDuriAnAbiAmr:
      return t.alDuriAnAbiAmr;
    case RecitationReading.AlSusiAnAbiAmr:
      return t.alSusiAnAbiAmr;
    case RecitationReading.KhalafAnHamzah:
      return t.khalafAnHamzah;
    case RecitationReading.KhalladAnAsim:
      return t.khalladAnAsim;
    case RecitationReading.ShubahAnAsim:
      return t.shubahAnAsim;
    case RecitationReading.AlBazziAnIbnKathir:
      return t.alBazziAnIbnKathir;
    case RecitationReading.QunbulAnIbnKathir:
      return t.qunbulAnIbnKathir;
    default:
      return reading;
  }
}

export function getRecitationDescription(reading: RecitationReading, t: RecitationLabels): string {
  switch (reading) {
    case RecitationReading.HafsAnAsim:
      return t.hafsAnAsimDesc;
    case RecitationReading.WarshAnNafi:
      return t.warshAnNafiDesc;
    case RecitationReading.QalunAnNafi:
      return t.qalunAnNafiDesc;
    case RecitationReading.AlDuriAnAbiAmr:
      return t.alDuriAnAbiAmrDesc;
    case RecitationReading.AlSusiAnAbiAmr:
      return t.alSusiAnAbiAmrDesc;
    case RecitationReading.KhalafAnHamzah:
      return t.khalafAnHamzahDesc;
    case RecitationReading.KhalladAnAsim:
      return t.khalladAnAsimDesc;
    case RecitationReading.ShubahAnAsim:
      return t.shubahAnAsimDesc;
    case RecitationReading.AlBazziAnIbnKathir:
      return t.alBazziAnIbnKathirDesc;
    case RecitationReading.QunbulAnIbnKathir:
      return t.qunbulAnIbnKathirDesc;
    default:
      return "";
  }
}
