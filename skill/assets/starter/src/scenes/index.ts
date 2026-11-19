import type { SceneDef } from "../deck";
import { Cover } from "./Cover";
import { Results } from "./Results";
import { BackupMethod } from "./BackupMethod";
import { DATA } from "../data";
import { isDark } from "../fx";

/**
 * Scene order = this array. Backup slides (appendix: true) stay out of the main flow; keep them at the end.
 * notes[0] is said after the entrance, notes[k] after step k. Keep each meta field on its own line as
 * `key: "literal"` (the phone-remote server reads this file).
 */
export const scenes: SceneDef[] = [
  {
    id: "cover",
    title: "Cover",
    steps: 0,
    speaker: "a",
    seconds: 20,
    hero: isDark("hero"),
    notes: ["Hello. In the next ten minutes we show one clear result and how we got there."],
    Component: Cover,
  },
  {
    id: "results",
    title: "Pages load four times faster",
    steps: 2,
    speaker: "b",
    section: "Results",
    seconds: 45,
    hero: isDark("content"),
    source: DATA.latency.source,
    notes: [
      "Twelve thousand people use the product every week, and that number grew by more than a third since spring.",
      "Under the same load, the slowest pages went from eight hundred forty milliseconds to two hundred ten.",
      "So the pages are four times faster for the people who wait the longest.",
    ],
    Component: Results,
  },
  {
    id: "backup-method",
    title: "How we measured the load time",
    steps: 0,
    appendix: true,
    hero: isDark("content"),
    tags: ["method", "load test", "k6", "p95"],
    notes: ["We replayed one real production day with k6, two hundred virtual users for ten minutes, three runs each."],
    Component: BackupMethod,
  },
];
