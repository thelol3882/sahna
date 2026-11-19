import type { SceneDef } from "../deck";
import { isDark } from "../fx";
import { Cover } from "./Cover";
import { Relay } from "./Relay";
import { Edge } from "./Edge";
import { Risk } from "./Risk";
import { Ledger } from "./Ledger";
import { Inside } from "./Inside";
import { Results } from "./Results";
import { End } from "./End";
import { BackupLatency } from "./BackupLatency";
import { DATA } from "../data";

/**
 * Scene order = this array. Backup slides (appendix: true) stay out of the main flow; keep them at the end.
 * notes[0] is said after the entrance, notes[k] after step k. Keep each meta field on its own line.
 * World placement and camera moves: src/scenes/world.ts.
 */
export const scenes: SceneDef[] = [
  {
    id: "cover",
    title: "Tessera: one payment, 180 ms",
    steps: 0,
    seconds: 30,
    hero: isDark("hero"),
    notes: ["This is Tessera, a payments platform. For the next nine minutes we follow one payment through it, stop by stop."],
    Component: Cover,
  },
  {
    id: "relay",
    title: "A payment is a relay, not a single call",
    steps: 1,
    section: "Route",
    seconds: 60,
    source: DATA.source,
    notes: [
      "A payment is not one request to one server. It is a relay: edge, risk, ledger, notify, and settlement later.",
      "End to end we have a budget of one hundred eighty milliseconds at p99. Fifty-seven of them are spent between the hops.",
    ],
    hero: isDark("content"),
    Component: Relay,
  },
  {
    id: "edge",
    title: "Edge says yes or no in 12 ms",
    steps: 1,
    section: "Core",
    seconds: 50,
    source: DATA.source,
    notes: [
      "The edge answers in twelve milliseconds. It runs in thirty-one regions, close to the payer.",
      "The important part is idempotency: a retried payment gets the same answer, so three retries are still one charge.",
    ],
    hero: isDark("content"),
    Component: Edge,
  },
  {
    id: "risk",
    title: "Risk scores every payment in 38 ms",
    steps: 1,
    section: "Core",
    seconds: 50,
    source: DATA.source,
    notes: [
      "Risk reads one hundred forty signals per payment, from four families, in thirty-eight milliseconds.",
      "Less than one percent goes to a person. Everything else is decided by the model.",
    ],
    hero: isDark("content"),
    Component: Risk,
  },
  {
    id: "ledger",
    title: "The ledger writes every cent twice",
    steps: 1,
    section: "Core",
    seconds: 50,
    source: DATA.source,
    notes: [
      "The ledger is double-entry: every cent leaves one account and arrives in another.",
      "So the sum of the entries is always zero. Now let's go one level down, through this window.",
    ],
    hero: isDark("content"),
    Component: Ledger,
  },
  {
    id: "inside",
    title: "Append first, apply second, index last",
    steps: 2,
    section: "Core",
    seconds: 70,
    source: DATA.source,
    notes: [
      "Inside the ledger a write has three phases: append to the log, apply to balances, index for queries.",
      "The append is durable once two of three replicas confirm it. That is most of the sixty-four milliseconds.",
      "And nothing is ever updated in place. A correction is a new entry, so the log is also the audit trail.",
    ],
    hero: isDark("content"),
    Component: Inside,
  },
  {
    id: "results",
    title: "What the relay adds up to",
    steps: 1,
    section: "Results",
    seconds: 50,
    source: DATA.source,
    notes: [
      "Back on the surface: one hundred eighty milliseconds at p99, four nines and a half, and no lost entries.",
      "Before the rewrite the same path took two point one seconds.",
    ],
    hero: isDark("content"),
    Component: Results,
  },
  {
    id: "end",
    title: "Questions",
    steps: 0,
    seconds: 20,
    hero: isDark("hero"),
    notes: ["That was the whole route. Every stop is still on the map, so ask about any of them."],
    Component: End,
  },
  {
    id: "backup-latency",
    title: "How the 180 ms is measured",
    steps: 0,
    appendix: true,
    tags: ["latency", "p99", "method", "measure"],
    notes: ["We measure at the payer's SDK, from tap to merchant answer, p99 over twenty-eight days."],
    hero: isDark("content"),
    Component: BackupLatency,
  },
];
