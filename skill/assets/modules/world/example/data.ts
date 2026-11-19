/**
 * Every number on a slide lives here, once, with its source.
 * EXAMPLE DECK: Tessera is a fictional payments platform; the figures are illustrative, not measurements.
 */
const SRC = "Illustrative figures · fictional system";
export const DATA = {
  source: SRC,
  hops: [
    { id: "edge", name: "Edge", ms: 12 },
    { id: "risk", name: "Risk", ms: 38 },
    { id: "ledger", name: "Ledger", ms: 64 },
    { id: "notify", name: "Notify", ms: 9 },
  ],
  network: 57, // ms between hops (queues, network)
  budget: 180, // p99 end-to-end, ms
  edge: { ms: 12, regions: 31, malformed: 4.1 },
  risk: { ms: 38, signals: 140, review: 0.7, families: [
    { name: "Behaviour", n: 52 }, { name: "Device", n: 38 }, { name: "Network", n: 27 }, { name: "History", n: 23 },
  ] },
  ledger: { ms: 64, write: [
    { name: "Append to log", detail: "fsync · 3 replicas", ms: 41 },
    { name: "Apply to balances", detail: "in memory, per account", ms: 15 },
    { name: "Index for queries", detail: "async-safe, idempotent", ms: 8 },
  ] },
  results: { p99: 180, availability: 99.995, lost: 0, before: 2100 },
};
