/** Shapes of the *.layout.json that scripts/layout.mjs writes (graph spec + ELK positions + resolved flows). */
export type Box = { x: number; y: number; w: number; h: number };
export type Tone = "default" | "core" | "entry" | "store" | "queue" | "external" | "hot" | "later" | "danger" | "ghost";

export type LNode = Box & {
  id: string; title: string; sub?: string; icon?: string; tone: Tone; group?: string;
  /** name of the graph this node opens into (zoom) */
  inside?: string;
  /** small number/letter badge on the corner */
  badge?: string;
  size: "lg" | "sm";
  /** the box edges attach to: the node itself, or its packed group */
  attach: string;
};
export type LGroup = Box & { id: string; title: string; layout: "column" | "row" | "grid" | "free"; cols?: number; tone?: string; members: string[] };
export type LEdge = { id: string; from: string; to: string; label?: string; dashed?: boolean; hot?: boolean; both?: boolean; points: number[][]; labelBox?: Box };
export type Hop = {
  from: string; to: string; edge: string; rev: boolean; label?: string;
  /** starts together with the previous hop */
  with?: boolean;
  /** fire-and-forget message (dashed in the sequence view) */
  async?: boolean;
  /** a response travelling back (dashed in the sequence view) */
  reply?: boolean;
  /** members of a group to light one by one on arrival */
  light?: string[];
  ms?: number;
};
export type LFlow = { title: string; color?: string; start: string; hops: Hop[] };
export type LGraph = {
  title: string; direction: string; width: number; height: number;
  nodes: LNode[]; groups: LGroup[]; edges: LEdge[]; flows: Record<string, LFlow>;
};
export type Metrics = Record<"lg" | "sm", { title: number; sub: number; icon: number; pad: number; gap: number }>;
export type LayoutFile = { metrics: Metrics; graphs: Record<string, LGraph> };

export type Region = Box;
export type Fit = { s: number; x: number; y: number };
