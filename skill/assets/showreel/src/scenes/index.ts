import type { SceneDef } from "../deck";
import { isDark } from "../fx";
import { sourceOf } from "../data-viz";
import { DATA } from "../data";
import { Hero } from "./Hero";
import { Bento } from "./Bento";
import { Product } from "./Product";
import { System } from "./System";
import { Tenants } from "./Tenants";
import { Code } from "./Code";
import { Numbers } from "./Numbers";
import { Growth } from "./Growth";
import { KzMap } from "./KzMap";
import { Close } from "./Close";
import { BackupSla } from "./BackupSla";

/**
 * The showreel: one continuous film of a launch keynote for Halo, a FICTIONAL same-day delivery platform.
 * `hero` follows the dial (dark hero from balanced up, dark content only in showcase) so the chrome matches.
 * Transitions: hero → bento dives through the title's full stop; bento → product flies the "Dispatch board" card
 * (data-shared); speaker changes get the style's boundary transition (system asks for the liquid shader).
 * Keep each meta field on its own line as `key: "literal"` (the phone-remote server reads this file).
 */
export const scenes: SceneDef[] = [
  {
    id: "hero",
    title: "Delivered by tonight, in every city",
    steps: 1,
    speaker: "a",
    seconds: 30,
    hero: isDark("hero"),
    full: true,
    exit: { through: ".hr-dot" },
    notes: ["This is Halo. Delivered by tonight, in every city.", "Same-day routing, live couriers, ten cities."],
    Component: Hero,
  },
  {
    id: "bento",
    title: "One dispatch for every courier",
    steps: 1,
    speaker: "a",
    section: "Product",
    seconds: 40,
    hero: isDark("content"),
    source: DATA.today.source,
    notes: [
      "Forty-eight thousand deliveries today, ninety-eight point seven percent inside the two-hour window.",
      "And the centre of it is the live map: every courier, every two seconds.",
    ],
    Component: Bento,
  },
  {
    id: "product",
    title: "See the late order before the customer does",
    steps: 2,
    speaker: "a",
    section: "Product",
    seconds: 45,
    hero: isDark("content"),
    notes: [
      "This is the dispatch board.",
      "Every courier with a live ETA against the promised window.",
      "Here: courier 0417 in Almaty will be sixteen minutes late, and Halo already moved two of the stops.",
    ],
    Component: Product,
  },
  {
    id: "system",
    title: "From the whole platform to one service",
    steps: 3,
    speaker: "b",
    section: "Architecture",
    seconds: 60,
    hero: isDark("content"),
    notes: [
      "Halo, the people who use it and the two services it calls.",
      "Inside: two apps, a gateway, three Go services and their stores.",
      "One order: created, stored, routed with the maps API, and answered.",
      "Inside Routing: cluster, solve, estimate, and cache the plan for the next courier.",
    ],
    Component: System,
  },
  {
    id: "tenants",
    title: "One table, and each merchant sees only its rows",
    steps: 1,
    speaker: "b",
    section: "Architecture",
    seconds: 35,
    hero: isDark("content"),
    notes: ["Two merchants share one orders table.", "Each runs the same query and sees only its three rows: the database adds the tenant."],
    Component: Tenants,
  },
  {
    id: "code",
    title: "Every outside call gets a deadline",
    steps: 3,
    speaker: "b",
    section: "Architecture",
    seconds: 50,
    hero: isDark("content"),
    notes: [
      "The handler behind every route.",
      "It calls the maps API with no limit.",
      "Now with a deadline: eight hundred milliseconds, then the fallback plan.",
      "One request: a cache miss, two hundred twelve milliseconds at the maps API, solved and cached.",
    ],
    Component: Code,
  },
  {
    id: "numbers",
    title: "A third of the week came on one day",
    steps: 2,
    speaker: "c",
    section: "Numbers",
    seconds: 40,
    hero: isDark("content"),
    source: sourceOf(DATA.launch),
    notes: [
      "Forty-eight thousand deliveries in one week.",
      "Day by day, most days look alike.",
      "Except Thursday: the Black Friday pre-sale, almost fifteen thousand in one day.",
    ],
    Component: Numbers,
  },
  {
    id: "growth",
    title: "Growth sped up after the courier app",
    steps: 3,
    speaker: "c",
    section: "Numbers",
    seconds: 45,
    hero: isDark("content"),
    source: sourceOf(DATA.growth),
    notes: [
      "We started with twelve hundred merchants; evening slots helped a little.",
      "Then the courier app.",
      "And the Kazakh interface in June.",
      "Before the app we grew a few percent a month; after it, twice as fast.",
    ],
    Component: Growth,
  },
  {
    id: "map",
    title: "One hub in Astana serves nine cities",
    steps: 3,
    speaker: "c",
    section: "Numbers",
    seconds: 45,
    hero: isDark("content"),
    source: sourceOf(DATA.kz),
    notes: ["Kazakhstan.", "Almaty and Astana carry almost half of the deliveries.", "One hub, nine cities.", "Every route starts in Astana."],
    Component: KzMap,
  },
  {
    id: "close",
    title: "Every city, by tonight",
    steps: 0,
    speaker: "a",
    seconds: 20,
    hero: isDark("hero"),
    full: true,
    notes: ["Every city, by tonight. Thank you, questions welcome."],
    Component: Close,
  },
  {
    id: "backup-sla",
    title: "How we count on time",
    steps: 0,
    appendix: true,
    hero: isDark("content"),
    tags: ["sla", "on time", "p95", "late"],
    notes: ["On time means the door scan inside two hours of the order; p95 is forty-one minutes."],
    Component: BackupSla,
  },
];
