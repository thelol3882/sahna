/**
 * Every number on a slide lives here, once, with its source. Charts compute totals, shares and ratios from these
 * values (never typed twice), so a changed number changes every place it appears.
 * The example numbers are ILLUSTRATIVE (a fictional product) and say so in their source line.
 */
const SAMPLE = "Illustrative sample data (fictional product)";

const byDay = [
  { key: "mon", label: "Mon", value: 4120 },
  { key: "tue", label: "Tue", value: 5034 },
  { key: "wed", label: "Wed", value: 6287 },
  { key: "thu", label: "Thu", value: 14902 },
  { key: "fri", label: "Fri", value: 8415 },
  { key: "sat", label: "Sat", value: 4766 },
  { key: "sun", label: "Sun", value: 4689 },
];

const funnel = [
  { key: "visit", label: "Visited", value: 120000 },
  { key: "signup", label: "Signed up", value: 46080 },
  { key: "active", label: "Activated", value: 19350 },
  { key: "paid", label: "Paid", value: 4640 },
];

export const DATA = {
  launch: {
    byDay,
    signups: byDay.reduce((s, d) => s + d.value, 0),
    peak: "thu",
    peakWhy: "Product Hunt feature",
    week: "3–9 Nov 2026",
    source: `${SAMPLE}: sign-ups per day, launch week`,
  },
  race: {
    entities: [
      { key: "almaty", label: "Almaty" },
      { key: "astana", label: "Astana" },
      { key: "shymkent", label: "Shymkent" },
      { key: "karaganda", label: "Karaganda" },
      { key: "aktobe", label: "Aktobe" },
      { key: "atyrau", label: "Atyrau" },
    ],
    frames: [
      { label: "Q1 2026", values: { almaty: 41200, astana: 28900, shymkent: 12300, karaganda: 9800, aktobe: 6100, atyrau: 7400 } },
      { label: "Q2 2026", values: { almaty: 43800, astana: 36100, shymkent: 15900, karaganda: 9950, aktobe: 7200, atyrau: 7600 } },
      { label: "Q3 2026", values: { almaty: 45100, astana: 44600, shymkent: 21700, karaganda: 10400, aktobe: 11900, atyrau: 7900 } },
      { label: "Q4 2026", values: { almaty: 46900, astana: 52300, shymkent: 27400, karaganda: 10800, aktobe: 14600, atyrau: 8200 } },
    ],
    source: `${SAMPLE}: orders per quarter by city`,
  },
  growth: {
    wau: [
      ["2025-01", 1200], ["2025-02", 1290], ["2025-03", 1380], ["2025-04", 1720], ["2025-05", 1900], ["2025-06", 2010],
      ["2025-07", 2150], ["2025-08", 2240], ["2025-09", 2380], ["2025-10", 2490], ["2025-11", 2950], ["2025-12", 3300],
      ["2026-01", 3650], ["2026-02", 4010], ["2026-03", 4420], ["2026-04", 4800], ["2026-05", 5230], ["2026-06", 5990],
      ["2026-07", 6540], ["2026-08", 7020], ["2026-09", 7610], ["2026-10", 8240],
    ] as [string, number][],
    plan: [["2025-01", 1200], ["2026-10", 6000]] as [string, number][],
    events: { free: "2025-04", mobile: "2025-11", kazakh: "2026-06" },
    source: `${SAMPLE}: weekly active users, monthly average`,
  },
  speed: {
    unit: "ms",
    before: { server: 520, network: 120, render: 200 },
    after: { server: 90, network: 60, render: 60 },
    source: `${SAMPLE}: p95 page load, load test of 200 virtual users`,
  },
  convert: {
    funnel,
    source: `${SAMPLE}: product funnel, Oct 2026`,
  },
  kz: {
    /** share of orders by map polygon, % (pre-2022 polygons: see src/data-viz/maps/kz.names.ts) */
    share: {
      "almaty": 24.1, "astana": 19.8, "turkistan": 10.2, "karaganda": 7.9, "almaty-region": 6.1, "east-kazakhstan": 5.4,
      "aktobe": 4.6, "atyrau": 3.9, "pavlodar": 3.3, "kostanay": 2.8, "zhambyl": 2.7, "mangystau": 2.6, "akmola": 2.1,
      "kyzylorda": 1.7, "west-kazakhstan": 1.6, "north-kazakhstan": 1.2,
    } as Record<string, number>,
    hub: "astana",
    served: ["almaty", "shymkent", "karaganda", "aktobe", "atyrau", "oskemen", "pavlodar", "kostanay", "aktau"],
    source: `${SAMPLE}: share of orders by region`,
  },
  formats: {
    users: 1284000, share: 38.4, revenue: 2450000, date: "2026-11-19",
    source: "Intl.NumberFormat / DateTimeFormat in Chromium (ICU)",
  },
};
