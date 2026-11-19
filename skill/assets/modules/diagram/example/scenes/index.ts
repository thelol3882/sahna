import type { SceneDef } from "../deck";
import { DARK } from "./diagrams/common";
import { SaasFlows } from "./diagrams/SaasFlows";
import { SaasSequence } from "./diagrams/SaasSequence";
import { SaasZoom } from "./diagrams/SaasZoom";
import { SaasTenants } from "./diagrams/SaasTenants";
import { SaasFailure } from "./diagrams/SaasFailure";
import { SaasScale } from "./diagrams/SaasScale";
import { SaasTrace } from "./diagrams/SaasTrace";
import { SaasStates } from "./diagrams/SaasStates";

/** Diagram module examples: a generic SaaS shop (one scene per story tool/kit). */
export const scenes: SceneDef[] = [
  {
    id: "flows",
    title: "Two journeys through the shop",
    steps: 2,
    hero: DARK,
    notes: ["This is the shop: two apps, a gateway, three services and their stores.", "Checkout: the gateway checks the token with Auth, then Orders writes the row and the 201 travels back.", "Paying is different: Billing answers at once, the receipt and the invoice happen later through the queue."],
    Component: SaasFlows,
  },
  {
    id: "sequence",
    title: "One request, two views",
    steps: 3,
    hero: DARK,
    notes: ["The same shop.", "Checkout on the map.", "Now the same eight hops in time order: who waits for whom.", "And back to the map."],
    Component: SaasSequence,
  },
  {
    id: "zoom",
    title: "From the whole shop to one service",
    steps: 2,
    hero: DARK,
    notes: ["Level one: the shop, its users and the two outside services.", "Level two: inside the shop.", "Level three: inside Orders, one request from handler to the outbox."],
    Component: SaasZoom,
  },
  {
    id: "tenants",
    title: "One table, and each shop sees only its rows",
    steps: 1,
    hero: DARK,
    notes: ["Two shops use the same database table.", "Each one runs the same query, and each sees only its three rows."],
    Component: SaasTenants,
  },
  {
    id: "failure",
    title: "When email is down, orders still go through",
    steps: 2,
    hero: DARK,
    notes: ["Receipts go through a queue.", "Mailgun times out. The worker retries with backoff, and the queue takes the load.", "Mailgun is back and the backlog drains."],
    Component: SaasFailure,
  },
  {
    id: "scale",
    title: "Three instances instead of one",
    steps: 2,
    hero: DARK,
    notes: ["One API instance behind a load balancer.", "Black Friday: p95 climbs to 840 milliseconds.", "Two replicas join, and p95 drops to 120."],
    Component: SaasScale,
  },
  {
    id: "trace",
    title: "Where the 182 ms of a checkout go",
    steps: 1,
    hero: DARK,
    notes: ["One checkout request and its trace.", "Each bar fills while the request is inside that service. Most of the time is in Orders."],
    Component: SaasTrace,
  },
  {
    id: "states",
    title: "Every state change passes a guard",
    steps: 3,
    hero: DARK,
    notes: ["An order is created.", "The payment guard passes.", "Packing is blocked: nothing in stock.", "Restocked: packed, shipped, delivered."],
    Component: SaasStates,
  },
];
