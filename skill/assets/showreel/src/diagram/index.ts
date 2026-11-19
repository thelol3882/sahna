// Diagram module: graph JSON → ELK layout at build time (scripts/layout.mjs) → animated, dial-aware diagrams.
export { Diagram, DiagramView, diagramView, stageBox, type View, type ViewOpts, type Level } from "./Diagram";
export { story, count, flowColor, resolveAt, makePacket, ride, type Story, type FlowOpts, type At } from "./story";
export { useLive, useStill, type Live } from "./live";
export { ICONS, registerIcons, DiagramIcon, type AnyIcon } from "./icons";
export { fit, toStage, toLayout, roundPath, pointAt, sequenceGeometry } from "./geometry";
export type { LayoutFile, LGraph, LNode, LEdge, LGroup, LFlow, Hop, Box, Region } from "./types";
// story kits
export { RowsTable, tenantIsolation, liveTenants, type Tenant, type TenantRow } from "./kits/tenants";
export { QueueGauge, FailureNotes, failure, recovery, liveFailure } from "./kits/failure";
export { Hud, hudTo, overload, scaleOut, liveRoundRobin, type Stat } from "./kits/scale";
export { Waterfall, trace, type Span } from "./kits/trace";
export { Token, machine } from "./kits/machine";
export { Captions, caption } from "./Captions";
