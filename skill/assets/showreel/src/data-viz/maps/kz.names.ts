import type { Loc } from "../format";

/**
 * Kazakhstan names in en / ru / kk (official forms as of 2024). Keys = ids in kz.map.json (geo/kz.config.json).
 *
 * BOUNDARIES: Natural Earth 1:10m admin-1 draws the oblasts BEFORE the June 2022 reform. Three current regions
 * have no polygon of their own: Abai (inside "east-kazakhstan"), Jetisu (inside "almaty-region"), Ulytau
 * (inside "karaganda"); the city of Shymkent (2018) lies inside "turkistan". `merged` names say so; use them
 * whenever a polygon is labelled or filled, and aggregate current-region data accordingly.
 */
type N = Record<Loc, string>;
export const KZ_REGIONS: Record<string, { name: N; short: N; merged?: N; center: string }> = {
  "akmola": { name: { en: "Akmola Region", ru: "Акмолинская область", kk: "Ақмола облысы" }, short: { en: "Akmola", ru: "Акмолинская", kk: "Ақмола" }, center: "kokshetau" },
  "aktobe": { name: { en: "Aktobe Region", ru: "Актюбинская область", kk: "Ақтөбе облысы" }, short: { en: "Aktobe", ru: "Актюбинская", kk: "Ақтөбе" }, center: "aktobe" },
  "almaty-region": { name: { en: "Almaty Region", ru: "Алматинская область", kk: "Алматы облысы" }, short: { en: "Almaty Region", ru: "Алматинская", kk: "Алматы облысы" },
    merged: { en: "Almaty Reg. + Jetisu", ru: "Алматинская + Жетысуская", kk: "Алматы облысы + Жетісу" }, center: "konaev" },
  "atyrau": { name: { en: "Atyrau Region", ru: "Атырауская область", kk: "Атырау облысы" }, short: { en: "Atyrau", ru: "Атырауская", kk: "Атырау" }, center: "atyrau" },
  "west-kazakhstan": { name: { en: "West Kazakhstan Region", ru: "Западно-Казахстанская область", kk: "Батыс Қазақстан облысы" }, short: { en: "West Kazakhstan", ru: "Западно-Казахстанская", kk: "Батыс Қазақстан" }, center: "oral" },
  "zhambyl": { name: { en: "Zhambyl Region", ru: "Жамбылская область", kk: "Жамбыл облысы" }, short: { en: "Zhambyl", ru: "Жамбылская", kk: "Жамбыл" }, center: "taraz" },
  "karaganda": { name: { en: "Karaganda Region", ru: "Карагандинская область", kk: "Қарағанды облысы" }, short: { en: "Karaganda", ru: "Карагандинская", kk: "Қарағанды" },
    merged: { en: "Karaganda + Ulytau", ru: "Карагандинская + Улытауская", kk: "Қарағанды + Ұлытау" }, center: "karaganda" },
  "kostanay": { name: { en: "Kostanay Region", ru: "Костанайская область", kk: "Қостанай облысы" }, short: { en: "Kostanay", ru: "Костанайская", kk: "Қостанай" }, center: "kostanay" },
  "kyzylorda": { name: { en: "Kyzylorda Region", ru: "Кызылординская область", kk: "Қызылорда облысы" }, short: { en: "Kyzylorda", ru: "Кызылординская", kk: "Қызылорда" }, center: "kyzylorda" },
  "mangystau": { name: { en: "Mangystau Region", ru: "Мангистауская область", kk: "Маңғыстау облысы" }, short: { en: "Mangystau", ru: "Мангистауская", kk: "Маңғыстау" }, center: "aktau" },
  "pavlodar": { name: { en: "Pavlodar Region", ru: "Павлодарская область", kk: "Павлодар облысы" }, short: { en: "Pavlodar", ru: "Павлодарская", kk: "Павлодар" }, center: "pavlodar" },
  "north-kazakhstan": { name: { en: "North Kazakhstan Region", ru: "Северо-Казахстанская область", kk: "Солтүстік Қазақстан облысы" }, short: { en: "North Kazakhstan", ru: "Северо-Казахстанская", kk: "Солтүстік Қазақстан" }, center: "petropavl" },
  "turkistan": { name: { en: "Turkistan Region", ru: "Туркестанская область", kk: "Түркістан облысы" }, short: { en: "Turkistan", ru: "Туркестанская", kk: "Түркістан" },
    merged: { en: "Turkistan + Shymkent", ru: "Туркестанская + Шымкент", kk: "Түркістан + Шымкент" }, center: "turkistan" },
  "east-kazakhstan": { name: { en: "East Kazakhstan Region", ru: "Восточно-Казахстанская область", kk: "Шығыс Қазақстан облысы" }, short: { en: "East Kazakhstan", ru: "Восточно-Казахстанская", kk: "Шығыс Қазақстан" },
    merged: { en: "East Kazakhstan + Abai", ru: "Восточно-Казахстанская + Абайская", kk: "Шығыс Қазақстан + Абай" }, center: "oskemen" },
  "astana": { name: { en: "Astana", ru: "Астана", kk: "Астана" }, short: { en: "Astana", ru: "Астана", kk: "Астана" }, center: "astana" },
  "almaty": { name: { en: "Almaty", ru: "Алматы", kk: "Алматы" }, short: { en: "Almaty", ru: "Алматы", kk: "Алматы" }, center: "almaty" },
};

export const KZ_CITIES: Record<string, N> = {
  astana: { en: "Astana", ru: "Астана", kk: "Астана" },
  almaty: { en: "Almaty", ru: "Алматы", kk: "Алматы" },
  shymkent: { en: "Shymkent", ru: "Шымкент", kk: "Шымкент" },
  karaganda: { en: "Karaganda", ru: "Караганда", kk: "Қарағанды" },
  aktobe: { en: "Aktobe", ru: "Актобе", kk: "Ақтөбе" },
  pavlodar: { en: "Pavlodar", ru: "Павлодар", kk: "Павлодар" },
  oskemen: { en: "Oskemen", ru: "Усть-Каменогорск", kk: "Өскемен" },
  semey: { en: "Semey", ru: "Семей", kk: "Семей" },
  atyrau: { en: "Atyrau", ru: "Атырау", kk: "Атырау" },
  aktau: { en: "Aktau", ru: "Актау", kk: "Ақтау" },
  kostanay: { en: "Kostanay", ru: "Костанай", kk: "Қостанай" },
  kyzylorda: { en: "Kyzylorda", ru: "Кызылорда", kk: "Қызылорда" },
  turkistan: { en: "Turkistan", ru: "Туркестан", kk: "Түркістан" },
  taraz: { en: "Taraz", ru: "Тараз", kk: "Тараз" },
  oral: { en: "Oral", ru: "Уральск", kk: "Орал" },
  petropavl: { en: "Petropavl", ru: "Петропавловск", kk: "Петропавл" },
  kokshetau: { en: "Kokshetau", ru: "Кокшетау", kk: "Көкшетау" },
  taldykorgan: { en: "Taldykorgan", ru: "Талдыкорган", kk: "Талдықорған" },
  zhezkazgan: { en: "Zhezkazgan", ru: "Жезказган", kk: "Жезқазған" },
  konaev: { en: "Konaev", ru: "Конаев", kk: "Қонаев" },
};

export const KZ_BOUNDARY_NOTE: N = {
  en: "Boundaries: Natural Earth (pre-2022 oblasts; Abai, Jetisu, Ulytau drawn within their former regions)",
  ru: "Границы: Natural Earth (до реформы 2022 г.; Абайская, Жетысуская и Улытауская — в составе прежних областей)",
  kk: "Шекаралар: Natural Earth (2022 жылғы реформаға дейін; Абай, Жетісу, Ұлытау бұрынғы облыстар құрамында)",
};
