/**
 * SurahJuzRef enum — mirrors the `surah_juz_ref` pgEnum in
 * `backend/db/schema/enums.ts`. Values derived from `db/schema.dbml`
 * (ground truth per REQ-002). Composed of 5 surahs (al_fatihah..al_maidah)
 * followed by 30 juz (1..30). Used by `home_work.current_surah_juz` and
 * `home_work.revision_surah_juz`.
 */
export enum SurahJuzRef {
  SurahAlFatihah = "surah_al_fatihah",
  SurahAlBaqarah = "surah_al_baqarah",
  SurahAalImran = "surah_aal_imran",
  SurahAnNisa = "surah_an_nisa",
  SurahAlMaidah = "surah_al_maidah",
  Juz1 = "juz_1",
  Juz2 = "juz_2",
  Juz3 = "juz_3",
  Juz4 = "juz_4",
  Juz5 = "juz_5",
  Juz6 = "juz_6",
  Juz7 = "juz_7",
  Juz8 = "juz_8",
  Juz9 = "juz_9",
  Juz10 = "juz_10",
  Juz11 = "juz_11",
  Juz12 = "juz_12",
  Juz13 = "juz_13",
  Juz14 = "juz_14",
  Juz15 = "juz_15",
  Juz16 = "juz_16",
  Juz17 = "juz_17",
  Juz18 = "juz_18",
  Juz19 = "juz_19",
  Juz20 = "juz_20",
  Juz21 = "juz_21",
  Juz22 = "juz_22",
  Juz23 = "juz_23",
  Juz24 = "juz_24",
  Juz25 = "juz_25",
  Juz26 = "juz_26",
  Juz27 = "juz_27",
  Juz28 = "juz_28",
  Juz29 = "juz_29",
  Juz30 = "juz_30",
}
