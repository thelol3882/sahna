import type { SceneDef } from "../deck";
import { Cover } from "./Cover";
import { Launch } from "./Launch";
import { Race } from "./Race";
import { Growth } from "./Growth";
import { Speed } from "./Speed";
import { Convert } from "./Convert";
import { KzMap } from "./KzMap";
import { Formats } from "./Formats";
import { DATA } from "../data";
import { VIZ, sourceOf } from "../data-viz";
import { allow } from "../fx/dial";
import kz from "../data-viz/maps/kz.map.json";

/**
 * Scene order = this array. notes[0] after the entrance, notes[k] after step k.
 * `hero: VIZ.dark` — showcase renders content scenes dark (the dial's darkContent), the footer and bars follow.
 */
export const scenes: SceneDef[] = [
  {
    id: "cover",
    title: "Numbers that land",
    steps: 0,
    hero: allow("darkHero"),
    notes: ["Every number in this deck comes from one data file with its source."],
    Component: Cover,
  },
  {
    id: "launch",
    title: "Launch week sign-ups",
    steps: 2,
    hero: VIZ.dark,
    source: sourceOf(DATA.launch),
    notes: [
      "In the first seven days, this many teams signed up.",
      "Here is how the week went, day by day.",
      "Thursday was the Product Hunt feature, almost a third of the whole week.",
    ],
    Component: Launch,
  },
  {
    id: "race",
    title: "Orders by city",
    steps: 3,
    hero: VIZ.dark,
    source: sourceOf(DATA.race),
    notes: ["First quarter: Almaty leads clearly.", "Second quarter: Astana closes in.", "Third quarter: almost level, and Aktobe passes Karaganda.", "By the fourth quarter Astana is first."],
    Component: Race,
  },
  {
    id: "growth",
    title: "Growth sped up after the mobile app",
    steps: 3,
    hero: VIZ.dark,
    source: sourceOf(DATA.growth),
    notes: ["We started 2025 with twelve hundred weekly users; the free tier gave the first jump.", "Then the mobile app.", "And since then the line has not slowed down; the Kazakh interface came in June.", "Before the app we grew about eight percent a month, after it almost ten."],
    Component: Growth,
  },
  {
    id: "speed",
    title: "Pages load four times faster",
    steps: 2,
    hero: VIZ.dark,
    source: sourceOf(DATA.speed),
    notes: ["This is the slowest page as it was: still loading.", "And this is the same page now.", "On one scale: eight hundred forty milliseconds before, two hundred ten now."],
    Component: Speed,
  },
  {
    id: "convert",
    title: "Most teams that activate never pay",
    steps: 3,
    hero: VIZ.dark,
    source: sourceOf(DATA.convert),
    notes: ["Take a hundred visitors.", "About thirty-eight of them sign up.", "Then they activate, and some pay.", "The biggest drop is the last one: only a quarter of active teams pay."],
    Component: Convert,
  },
  {
    id: "kz-map",
    title: "One hub in Astana serves nine cities",
    steps: 3,
    hero: VIZ.dark,
    source: `${DATA.kz.source} · ${kz.source}`,
    notes: ["Kazakhstan.", "Almaty and Astana bring almost half of all orders.", "One warehouse in Astana serves nine cities.", "These are the next-day routes."],
    tags: ["map", "kazakhstan", "regions", "cities"],
    Component: KzMap,
  },
  {
    id: "formats",
    title: "Number formatting per locale",
    steps: 0,
    hero: VIZ.dark,
    appendix: true,
    tags: ["locale", "format", "tenge", "kk", "ru"],
    source: DATA.formats.source,
    notes: ["The same values printed for English, Russian and Kazakh."],
    Component: Formats,
  },
];
