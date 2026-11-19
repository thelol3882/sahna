/**
 * Every number on a slide lives here, once, with its source. Halo is a FICTIONAL product: every value is
 * illustrative sample data and the source lines say so. Charts compute totals, shares and ratios from these values.
 */
const SAMPLE = "Illustrative sample data (fictional product Halo)";

const byDay = [
  { key: "mon", label: "Mon", value: 4120 },
  { key: "tue", label: "Tue", value: 5034 },
  { key: "wed", label: "Wed", value: 6287 },
  { key: "thu", label: "Thu", value: 14902 },
  { key: "fri", label: "Fri", value: 8415 },
  { key: "sat", label: "Sat", value: 4766 },
  { key: "sun", label: "Sun", value: 4689 },
];

export const DATA = {
  today: { deliveries: 48213, onTime: 98.7, cities: 10, couriers: 1240, source: `${SAMPLE}: dispatch telemetry, 18 Nov 2026` },
  late: { courier: "Courier 0417 · Almaty", eta: 46, promised: 30, ratio: 1.5 },
  launch: {
    byDay,
    total: byDay.reduce((s, d) => s + d.value, 0),
    peak: "thu",
    peakWhy: "Black Friday pre-sale",
    week: "3–9 Nov 2026",
    source: `${SAMPLE}: deliveries per day, one week`,
  },
  growth: {
    wau: [
      ["2025-01", 1200], ["2025-02", 1290], ["2025-03", 1380], ["2025-04", 1720], ["2025-05", 1900], ["2025-06", 2010],
      ["2025-07", 2150], ["2025-08", 2240], ["2025-09", 2380], ["2025-10", 2490], ["2025-11", 2950], ["2025-12", 3300],
      ["2026-01", 3650], ["2026-02", 4010], ["2026-03", 4420], ["2026-04", 4800], ["2026-05", 5230], ["2026-06", 5990],
      ["2026-07", 6540], ["2026-08", 7020], ["2026-09", 7610], ["2026-10", 8240],
    ] as [string, number][],
    plan: [["2025-01", 1200], ["2026-10", 6000]] as [string, number][],
    events: { evening: "2025-04", app: "2025-11", kazakh: "2026-06" },
    source: `${SAMPLE}: active merchants per week, monthly average`,
  },
  kz: {
    /** share of deliveries by map polygon, % (pre-2022 polygons: see src/data-viz/maps/kz.names.ts) */
    share: {
      "almaty": 24.1, "astana": 19.8, "turkistan": 10.2, "karaganda": 7.9, "almaty-region": 6.1, "east-kazakhstan": 5.4,
      "aktobe": 4.6, "atyrau": 3.9, "pavlodar": 3.3, "kostanay": 2.8, "zhambyl": 2.7, "mangystau": 2.6, "akmola": 2.1,
      "kyzylorda": 1.7, "west-kazakhstan": 1.6, "north-kazakhstan": 1.2,
    } as Record<string, number>,
    hub: "astana",
    served: ["almaty", "shymkent", "karaganda", "aktobe", "atyrau", "oskemen", "pavlodar", "kostanay", "aktau"],
    source: `${SAMPLE}: share of deliveries by region`,
  },
  sla: { window: "2 h", p95: 41, budget: 60, unit: "min", source: `${SAMPLE}: SLA report, Oct 2026` },
};
