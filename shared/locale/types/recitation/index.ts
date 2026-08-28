/**
 * Recitation namespace labels — display names for each Qira'ah reading.
 *
 * Used by:
 *  - Frontend registration form (`useAppTranslation(Recitation)` for the
 *    recitation-reading selector labels + helper text).
 *  - Backend catalog service (`getServerTranslations(locale).recitationTranslations`
 *    if server-side display is ever needed — currently not required).
 *
 * Each key corresponds to a `RecitationReading` enum value. The label is the
 * human-readable display name (e.g. "Hafs `an Asim" / "حفص عن عاصم").
 *
 * Labels are translated, never stored in code.
 */
export interface RecitationLabels {
  /** Section heading for the recitation selector */
  readonly selectTitle: string;
  /** Helper text explaining the selection is optional + a preference */
  readonly selectHelper: string;
  /** Short description for the selector card */
  readonly selectDescription: string;
  /** Label for Hafs `an Asim */
  readonly hafsAnAsim: string;
  /** Label for Warsh `an Nafi */
  readonly warshAnNafi: string;
  /** Label for Qalun `an Nafi */
  readonly qalunAnNafi: string;
  /** Label for Al-Duri `an Abu Amr */
  readonly alDuriAnAbiAmr: string;
  /** Label for Al-Susi `an Abu Amr */
  readonly alSusiAnAbiAmr: string;
  /** Label for Khalaf `an Hamzah */
  readonly khalafAnHamzah: string;
  /** Label for Khallad `an Asim */
  readonly khalladAnAsim: string;
  /** Label for Shubah `an Asim */
  readonly shubahAnAsim: string;
  /** Label for Al-Bazzi `an Ibn Kathir */
  readonly alBazziAnIbnKathir: string;
  /** Label for Qunbul `an Ibn Kathir */
  readonly qunbulAnIbnKathir: string;
  /** Short description for each reading (region/context) */
  readonly hafsAnAsimDesc: string;
  readonly warshAnNafiDesc: string;
  readonly qalunAnNafiDesc: string;
  readonly alDuriAnAbiAmrDesc: string;
  readonly alSusiAnAbiAmrDesc: string;
  readonly khalafAnHamzahDesc: string;
  readonly khalladAnAsimDesc: string;
  readonly shubahAnAsimDesc: string;
  readonly alBazziAnIbnKathirDesc: string;
  readonly qunbulAnIbnKathirDesc: string;
  /** "Most popular" badge for Hafs (the default) */
  readonly mostPopular: string;
  /** Validation error: unknown recitation value */
  readonly invalidRecitation: string;
}
