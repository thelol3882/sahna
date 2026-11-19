// Diagram layout at build time: every src/graphs/*.graph.json → *.layout.json next to it (ELK layered + pins).
//   node scripts/layout.mjs [dir|file …]      (runs before dev/build: see "predev", "prebuild", "prebuild:single")
//   node scripts/layout.mjs --check           validate only, write nothing (exit 1 on errors)
// Nothing of ELK reaches the bundle: scenes import only the *.layout.json this script writes.
// Output is deterministic (fixed seed, model order, rounded numbers) and is only rewritten when it changed.
import ELK from "elkjs/lib/elk.bundled.js";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const targets = args.filter((a) => !a.startsWith("--"));
const ROOT = process.cwd();

/* ------------------------------------------------------------------ metrics (shared with Diagram.tsx via the output) */

// Node type scale. "lg" for nodes with h >= 96, else "sm". Diagram.tsx reads these from the layout file.
export const METRICS = {
  lg: { title: 26, sub: 20, icon: 52, pad: 22, gap: 16 },
  sm: { title: 22, sub: 20, icon: 40, pad: 16, gap: 12 },
};
const DEF = { w: 300, h: 104 }; // a top-level node (graph "size": "sm" → SM)
const SM = { w: 230, h: 84 };
const CHILD = { w: 200, h: 80 }; // a node inside a packed group
const GROUP_PAD = { top: 56, side: 18, bottom: 18, gap: 14 }; // group frame: title row on top
const PIN_GAP = 48;

/** Rough Inter advance widths (em) by character class; good to ~5 %, the runtime check (scrollWidth) is the judge. */
function textWidth(s, px, bold) {
  let w = 0;
  for (const ch of s) {
    if (" ".includes(ch)) w += 0.27;
    else if ("iljI.,:;'|!·".includes(ch)) w += 0.3;
    else if ("ft()[]/\\r-".includes(ch)) w += 0.38;
    else if ("mwMW@%".includes(ch)) w += 0.88;
    else if (/[A-Z]/.test(ch)) w += 0.7;
    else if (/[0-9]/.test(ch)) w += 0.6;
    else if (/[а-яёәғқңөұүһі]/i.test(ch)) w += 0.62;
    else w += 0.56;
  }
  return w * px * (bold ? 1.06 : 1) * 1.04;
}
function needWidth(n, size) {
  const m = METRICS[size];
  const text = Math.max(textWidth(n.title ?? "", m.title, true), n.sub ? textWidth(n.sub, m.sub, false) : 0);
  return Math.ceil(m.pad * 2 + (n.icon ? m.icon + m.gap : 0) + text + 6);
}

/* ------------------------------------------------------------------ validation */

const NODE_KEYS = new Set(["id", "title", "sub", "icon", "tone", "kind", "group", "w", "h", "pin", "inside", "badge", "note"]);
const GROUP_KEYS = new Set(["id", "title", "layout", "cols", "tone"]);
const EDGE_KEYS = new Set(["id", "from", "to", "label", "dashed", "hot", "both"]);
const GRAPH_KEYS = new Set(["title", "direction", "spacing", "size", "nodes", "groups", "edges", "flows", "$comment"]);
const TONES = new Set(["default", "core", "entry", "store", "queue", "external", "hot", "later", "danger", "ghost"]);
const ID = /^[a-zA-Z][\w-]*$/;

function iconNames() {
  const f = join(ROOT, "src/diagram/icons.tsx");
  if (!existsSync(f)) return null;
  const src = readFileSync(f, "utf8");
  const body = src.slice(src.indexOf("export const ICONS"), src.indexOf("/* end ICONS */"));
  return new Set([...body.matchAll(/"?([\w-]+)"?\s*:\s*[A-Za-z]/g)].map((m) => m[1]));
}

/** Normalises one graph and returns { graph, errors, warnings }. */
function validate(name, g, allNames, icons) {
  const errors = [], warnings = [];
  const at = (p) => `graph "${name}" › ${p}`;
  if (typeof g !== "object" || !g) return { errors: [at("must be an object")], warnings };
  for (const k of Object.keys(g)) if (!GRAPH_KEYS.has(k)) warnings.push(at(`unknown key "${k}" (allowed: ${[...GRAPH_KEYS].join(", ")})`));
  if (!Array.isArray(g.nodes) || !g.nodes.length) errors.push(at(`"nodes" must be a non-empty array`));
  if (g.direction && !["RIGHT", "DOWN", "LEFT", "UP"].includes(g.direction)) errors.push(at(`direction "${g.direction}" must be RIGHT, DOWN, LEFT or UP`));
  const nodes = g.nodes ?? [], groups = g.groups ?? [], edges = g.edges ?? [];
  const ids = new Map();
  const seen = (id, where) => {
    if (typeof id !== "string" || !ID.test(id)) { errors.push(at(`${where}: id ${JSON.stringify(id)} must match ${ID} (it becomes a CSS class)`)); return; }
    if (ids.has(id)) errors.push(at(`${where}: duplicate id "${id}" (also ${ids.get(id)})`));
    ids.set(id, where);
  };
  groups.forEach((x, i) => {
    const w = `groups[${i}]${x?.id ? ` "${x.id}"` : ""}`;
    seen(x.id, w);
    for (const k of Object.keys(x)) if (!GROUP_KEYS.has(k)) warnings.push(at(`${w}: unknown key "${k}"`));
    if (x.layout && !["column", "row", "grid", "free"].includes(x.layout)) errors.push(at(`${w}: layout "${x.layout}" must be column, row, grid or free`));
    if (x.layout === "grid" && x.cols !== undefined && !(Number.isInteger(x.cols) && x.cols > 0)) errors.push(at(`${w}: cols must be a positive integer`));
  });
  const groupIds = new Set(groups.map((x) => x.id));
  nodes.forEach((n, i) => {
    const w = `nodes[${i}]${n?.id ? ` "${n.id}"` : ""}`;
    seen(n.id, w);
    for (const k of Object.keys(n)) if (!NODE_KEYS.has(k)) warnings.push(at(`${w}: unknown key "${k}" (allowed: ${[...NODE_KEYS].join(", ")})`));
    if (typeof n.title !== "string" || !n.title) errors.push(at(`${w}: "title" is required`));
    const tone = n.tone ?? n.kind;
    if (tone && !TONES.has(tone)) errors.push(at(`${w}: tone "${tone}" must be one of ${[...TONES].join(", ")}`));
    if (n.group && !groupIds.has(n.group)) errors.push(at(`${w}: group "${n.group}" is not in "groups"`));
    if (n.icon && icons && !icons.has(n.icon)) warnings.push(at(`${w}: icon "${n.icon}" is not in src/diagram/icons.tsx (register it, or it renders without an icon)`));
    if (n.inside && !allNames.has(n.inside)) errors.push(at(`${w}: inside "${n.inside}" is not a graph in this file (have: ${[...allNames].join(", ")})`));
    if (n.inside === name) errors.push(at(`${w}: inside points at its own graph`));
    for (const k of ["w", "h"]) if (n[k] !== undefined && !(typeof n[k] === "number" && n[k] > 20)) errors.push(at(`${w}: ${k} must be a number > 20`));
    if (n.pin) {
      const p = n.pin, dirs = ["below", "above", "right", "left"].filter((d) => p[d]);
      if (n.group) errors.push(at(`${w}: a pinned node cannot sit in a group`));
      if (dirs.length > 1) errors.push(at(`${w}: pin takes one of below/above/right/left, got ${dirs.join("+")}`));
      if (!dirs.length && !(typeof p.x === "number" && typeof p.y === "number")) errors.push(at(`${w}: pin needs {below|above|right|left: id} or {x, y}`));
    }
  });
  for (const n of nodes) if (n.pin) {
    const ref = n.pin.below ?? n.pin.above ?? n.pin.right ?? n.pin.left;
    if (ref && !ids.has(ref)) errors.push(at(`nodes "${n.id}": pin target "${ref}" does not exist`));
  }
  for (const x of groups) if (!nodes.some((n) => n.group === x.id)) errors.push(at(`groups "${x.id}": has no nodes (set "group": "${x.id}" on some)`));
  const edgeIds = new Set();
  const outEdges = edges.map((e, i) => {
    const id = e.id ?? `${e.from}-${e.to}`;
    const w = `edges[${i}] "${id}"`;
    for (const k of Object.keys(e)) if (!EDGE_KEYS.has(k)) warnings.push(at(`${w}: unknown key "${k}" (allowed: ${[...EDGE_KEYS].join(", ")})`));
    if (!ID.test(id)) errors.push(at(`${w}: id must match ${ID}`));
    if (edgeIds.has(id)) errors.push(at(`${w}: duplicate edge id (two edges between the same nodes need explicit "id")`));
    edgeIds.add(id);
    for (const end of ["from", "to"]) if (!ids.has(e[end])) errors.push(at(`${w}: "${end}": "${e[end]}" is not a node or group`));
    if (e.from === e.to) errors.push(at(`${w}: self-loops are not supported`));
    return { ...e, id };
  });
  if (errors.length) return { errors, warnings };
  return { graph: { ...g, edges: outEdges }, errors, warnings };
}

/* ------------------------------------------------------------------ layout */

const elk = new ELK();

function packGroup(g, kids) {
  const PAD = GROUP_PAD;
  const cols = g.layout === "grid" ? g.cols ?? 2 : g.layout === "row" ? kids.length : 1;
  const w = Math.max(...kids.map((k) => k.w)), h = Math.max(...kids.map((k) => k.h));
  const pos = {};
  kids.forEach((k, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    pos[k.id] = { x: PAD.side + c * (w + PAD.gap), y: PAD.top + r * (h + PAD.gap), w, h };
  });
  const rows = Math.ceil(kids.length / cols);
  return { pos, w: PAD.side * 2 + cols * w + (cols - 1) * PAD.gap, h: PAD.top + rows * h + (rows - 1) * PAD.gap + PAD.bottom };
}

const R = (v) => Math.round(v);

async function layoutGraph(name, graph) {
  const groups = graph.groups ?? [];
  const packedGroups = groups.filter((g) => (g.layout ?? "column") !== "free");
  const freeGroups = groups.filter((g) => g.layout === "free");
  // sizes: explicit w/h, else defaults grown to fit the text (estimate)
  const size = {};
  for (const n of graph.nodes) {
    const packed = n.group && packedGroups.some((g) => g.id === n.group);
    const base = packed ? CHILD : graph.size === "sm" ? SM : DEF;
    const h = n.h ?? base.h;
    const s = h >= 96 ? "lg" : "sm";
    const need = needWidth(n, s);
    const w = n.w ?? Math.max(base.w, need);
    size[n.id] = { w, h, size: s, need };
  }
  // members of a packed group share the widest member's width
  const packed = {};
  for (const g of packedGroups) {
    const kids = graph.nodes.filter((n) => n.group === g.id).map((n) => ({ id: n.id, w: size[n.id].w, h: size[n.id].h }));
    packed[g.id] = packGroup(g, kids);
  }
  const pinned = new Map(graph.nodes.filter((n) => n.pin).map((n) => [n.id, n]));
  const nodeOf = new Map(graph.nodes.map((n) => [n.id, n]));
  // which box an edge attaches to: a packed group's member → the group box
  const owner = (id) => {
    const n = nodeOf.get(id);
    return n?.group && packed[n.group] ? n.group : id;
  };
  const elkNode = (n) => ({ id: n.id, width: size[n.id].w, height: size[n.id].h });
  const top = graph.nodes.filter((n) => !n.group && !pinned.has(n.id)).map(elkNode);
  for (const g of packedGroups) top.push({ id: g.id, width: packed[g.id].w, height: packed[g.id].h });
  for (const g of freeGroups) top.push({
    id: g.id,
    layoutOptions: { "elk.padding": `[top=${GROUP_PAD.top},left=${GROUP_PAD.side},bottom=${GROUP_PAD.bottom},right=${GROUP_PAD.side}]` },
    children: graph.nodes.filter((n) => n.group === g.id).map(elkNode),
  });
  const isPinnedEdge = (e) => pinned.has(e.from) || pinned.has(e.to);
  const elkEdges = graph.edges.filter((e) => !isPinnedEdge(e)).map((e) => ({
    id: e.id, sources: [owner(e.from)], targets: [owner(e.to)],
    labels: e.label ? [{ text: e.label, width: R(textWidth(e.label, 18, false) + 26), height: 32 }] : [],
  }));
  const res = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": graph.direction ?? "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.json.edgeCoords": "ROOT",
      "elk.json.shapeCoords": "ROOT",
      "elk.randomSeed": "1",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(graph.spacing ?? 110),
      "elk.spacing.nodeNode": "44",
      "elk.spacing.edgeNode": "26",
      "elk.spacing.edgeEdge": "18",
      "elk.spacing.edgeLabel": "6",
      "elk.layered.spacing.edgeNodeBetweenLayers": "26",
      "elk.edgeLabels.placement": "CENTER",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.padding": "[top=14,left=14,bottom=14,right=14]",
    },
    children: top,
    edges: elkEdges,
  });

  const nodes = {}, groupBox = {}, edgePts = {}, labelBox = {};
  for (const c of res.children) {
    const box = { x: c.x, y: c.y, w: c.width, h: c.height };
    if (packed[c.id]) {
      groupBox[c.id] = box;
      for (const [id, p] of Object.entries(packed[c.id].pos)) nodes[id] = { x: c.x + p.x, y: c.y + p.y, w: p.w, h: p.h };
    } else if (c.children) {
      groupBox[c.id] = box;
      for (const k of c.children) nodes[k.id] = { x: k.x, y: k.y, w: k.width, h: k.height };
    } else nodes[c.id] = box;
  }
  for (const e of res.edges ?? []) {
    const s = e.sections?.[0];
    if (!s) continue;
    edgePts[e.id] = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((p) => [R(p.x), R(p.y)]);
    const l = e.labels?.[0];
    if (l) labelBox[e.id] = { x: R(l.x), y: R(l.y), w: R(l.width), h: R(l.height) };
  }
  // pinned nodes: resolve in dependency order (a pin may point at another pinned node)
  const placed = new Set(Object.keys(nodes).concat(Object.keys(groupBox)));
  const boxOf = (id) => nodes[id] ?? groupBox[id];
  let todo = [...pinned.values()], guard = 0;
  while (todo.length && guard++ < 100) {
    todo = todo.filter((n) => {
      const p = n.pin, ref = p.below ?? p.above ?? p.right ?? p.left;
      if (ref && !placed.has(ref)) return true;
      const { w, h } = size[n.id], gap = p.gap ?? PIN_GAP, b = ref ? boxOf(ref) : null;
      nodes[n.id] = p.below ? { x: b.x + (b.w - w) / 2, y: b.y + b.h + gap, w, h }
        : p.above ? { x: b.x + (b.w - w) / 2, y: b.y - gap - h, w, h }
        : p.right ? { x: b.x + b.w + gap, y: b.y + (b.h - h) / 2, w, h }
        : p.left ? { x: b.x - gap - w, y: b.y + (b.h - h) / 2, w, h }
        : { x: p.x, y: p.y, w, h };
      placed.add(n.id);
      return false;
    });
  }
  if (todo.length) throw new Error(`graph "${name}": pin cycle between ${todo.map((n) => n.id).join(", ")}`);
  // edges touching a pinned node: straight when aligned, else one elbow
  for (const e of graph.edges.filter(isPinnedEdge)) {
    const a = boxOf(owner(e.from)), b = boxOf(owner(e.to));
    const acx = a.x + a.w / 2, bcx = b.x + b.w / 2, acy = a.y + a.h / 2, bcy = b.y + b.h / 2;
    let pts;
    if (b.y >= a.y + a.h) pts = Math.abs(acx - bcx) < 2 ? [[acx, a.y + a.h], [bcx, b.y]] : [[acx, a.y + a.h], [acx, (a.y + a.h + b.y) / 2], [bcx, (a.y + a.h + b.y) / 2], [bcx, b.y]];
    else if (b.y + b.h <= a.y) pts = Math.abs(acx - bcx) < 2 ? [[acx, a.y], [bcx, b.y + b.h]] : [[acx, a.y], [acx, (a.y + b.y + b.h) / 2], [bcx, (a.y + b.y + b.h) / 2], [bcx, b.y + b.h]];
    else if (b.x >= a.x + a.w) pts = Math.abs(acy - bcy) < 2 ? [[a.x + a.w, acy], [b.x, bcy]] : [[a.x + a.w, acy], [(a.x + a.w + b.x) / 2, acy], [(a.x + a.w + b.x) / 2, bcy], [b.x, bcy]];
    else pts = Math.abs(acy - bcy) < 2 ? [[a.x, acy], [b.x + b.w, bcy]] : [[a.x, acy], [(a.x + b.x + b.w) / 2, acy], [(a.x + b.x + b.w) / 2, bcy], [b.x + b.w, bcy]];
    edgePts[e.id] = pts.map(([x, y]) => [R(x), R(y)]);
    if (e.label) {
      const [p, q] = [pts[Math.floor((pts.length - 1) / 2)], pts[Math.floor((pts.length - 1) / 2) + 1]];
      const lw = R(textWidth(e.label, 18, false) + 26);
      labelBox[e.id] = { x: R((p[0] + q[0]) / 2 - lw / 2), y: R((p[1] + q[1]) / 2 - 16), w: lw, h: 32 };
    }
  }
  // normalise: shift everything so the content starts at (12, 12)
  const boxes = [...Object.values(nodes), ...Object.values(groupBox), ...Object.values(labelBox)];
  const minX = Math.min(...boxes.map((b) => b.x)) - 12, minY = Math.min(...boxes.map((b) => b.y)) - 12;
  const sh = (b) => ({ x: R(b.x - minX), y: R(b.y - minY), w: R(b.w), h: R(b.h) });
  for (const k in nodes) nodes[k] = sh(nodes[k]);
  for (const k in groupBox) groupBox[k] = sh(groupBox[k]);
  for (const k in labelBox) labelBox[k] = sh(labelBox[k]);
  for (const k in edgePts) edgePts[k] = edgePts[k].map(([x, y]) => [R(x - minX), R(y - minY)]);
  const all = [...Object.values(nodes), ...Object.values(groupBox), ...Object.values(labelBox)];
  const width = Math.max(...all.map((b) => b.x + b.w)) + 12, height = Math.max(...all.map((b) => b.y + b.h)) + 12;

  const warnings = [];
  for (const n of graph.nodes) if (n.w !== undefined && size[n.id].need > n.w) warnings.push(`graph "${name}" › node "${n.id}": w ${n.w} is probably too narrow for its text (needs ~${size[n.id].need})`);

  return {
    warnings,
    out: {
      title: graph.title ?? name,
      direction: graph.direction ?? "RIGHT",
      width: R(width), height: R(height),
      nodes: graph.nodes.map((n) => {
        const { pin, kind, ...rest } = n;
        return { ...rest, tone: n.tone ?? kind ?? "default", size: size[n.id].size, attach: owner(n.id), ...nodes[n.id] };
      }),
      groups: groups.map((g) => ({ ...g, layout: g.layout ?? "column", members: graph.nodes.filter((n) => n.group === g.id).map((n) => n.id), ...groupBox[g.id] })),
      edges: graph.edges.map((e) => ({ ...e, points: edgePts[e.id], ...(labelBox[e.id] ? { labelBox: labelBox[e.id] } : {}) })),
    },
  };
}

/* ------------------------------------------------------------------ flows (journeys) */

/**
 * A flow is a list of hops. path[0] is the start node; every later entry is "nodeId", "nodeId: label" or
 * { to, from?, label?, with?, async?, reply?, light? }; a leading "<" in the string form marks a reply ("<web: 201"). Each hop is resolved to an edge (forward, or reverse when only
 * the opposite edge exists). A hop into a member of a packed group rides the group's edge and lights the member.
 */
function resolveFlows(name, graph, out) {
  const errors = [];
  const flows = {};
  const nodeById = new Map(out.nodes.map((n) => [n.id, n]));
  const groupById = new Map(out.groups.map((g) => [g.id, g]));
  const attach = (id) => nodeById.get(id)?.attach ?? id;
  const findEdge = (a, b) => {
    for (const [x, y] of [[a, b], [attach(a), attach(b)], [a, attach(b)], [attach(a), b]]) {
      const f = out.edges.find((e) => e.from === x && e.to === y);
      if (f) return { edge: f.id, rev: false };
      const r = out.edges.find((e) => e.from === y && e.to === x);
      if (r) return { edge: r.id, rev: true };
    }
    return null;
  };
  for (const [fname, f] of Object.entries(graph.flows ?? {})) {
    const at = (p) => `graph "${name}" › flows "${fname}"${p ? ` › ${p}` : ""}`;
    if (!ID.test(fname)) errors.push(at(`flow name must match ${ID}`));
    const spec = Array.isArray(f) ? { path: f } : f;
    if (!Array.isArray(spec.path) || spec.path.length < 2) { errors.push(at(`"path" needs a start node and at least one hop`)); continue; }
    const parse = (h) => {
      if (typeof h === "string") {
        const reply = h.trim().startsWith("<"), s = reply ? h.trim().slice(1) : h, i = s.indexOf(":");
        return { ...(i < 0 ? { to: s.trim() } : { to: s.slice(0, i).trim(), label: s.slice(i + 1).trim() }), ...(reply ? { reply: true } : {}) };
      }
      return { ...h };
    };
    const first = parse(spec.path[0]);
    const start = first.to;
    if (!nodeById.has(start) && !groupById.has(start)) errors.push(at(`path[0] "${start}" is not a node`));
    let prev = start;
    const hops = [];
    spec.path.slice(1).forEach((raw, i) => {
      const h = parse(raw);
      const from = h.from ?? prev;
      if (!nodeById.has(h.to) && !groupById.has(h.to)) { errors.push(at(`path[${i + 1}] "${h.to}" is not a node or group`)); return; }
      const found = findEdge(from, h.to);
      if (!found) { errors.push(at(`path[${i + 1}]: no edge between "${from}" and "${h.to}" (add one to "edges", or fix the path)`)); return; }
      const g = groupById.get(h.to);
      const light = h.light === true && g ? g.members : Array.isArray(h.light) ? h.light : undefined;
      hops.push({ from, to: h.to, edge: found.edge, rev: found.rev, ...(h.label ? { label: h.label } : {}), ...(h.with ? { with: true } : {}), ...(h.async ? { async: true } : {}), ...(h.reply ? { reply: true } : {}), ...(h.ms !== undefined ? { ms: h.ms } : {}), ...(light ? { light } : {}) });
      prev = h.to;
    });
    if (spec.back) {
      const fw = hops.filter((h) => !h.async);
      // reply along the same edges in reverse order, only for the synchronous chain
      const chain = [];
      for (const h of fw) { if (chain.length && chain[chain.length - 1].to !== h.from) break; chain.push(h); }
      chain.slice().reverse().forEach((h, i) => hops.push({ from: h.to, to: h.from, edge: h.edge, rev: !h.rev, reply: true, ...(i === chain.length - 1 && spec.backLabel ? { label: spec.backLabel } : {}) }));
    }
    flows[fname] = { title: spec.title ?? fname, ...(spec.color ? { color: spec.color } : {}), start, hops };
  }
  return { flows, errors };
}

/* ------------------------------------------------------------------ main */

function files() {
  const list = targets.length ? targets : ["src/graphs"];
  const out = [];
  for (const t of list) {
    const p = join(ROOT, t);
    if (!existsSync(p)) { console.error(`layout: ${t} does not exist`); process.exit(1); }
    if (statSync(p).isDirectory()) out.push(...readdirSync(p).filter((f) => f.endsWith(".graph.json")).sort().map((f) => join(p, f)));
    else out.push(p);
  }
  return out;
}

let failed = false;
const icons = iconNames();
for (const file of files()) {
  const rel = relative(ROOT, file);
  let spec;
  try { spec = JSON.parse(readFileSync(file, "utf8")); } catch (e) { console.error(`✖ ${rel}: invalid JSON: ${e.message}`); failed = true; continue; }
  const names = new Set(Object.keys(spec).filter((k) => !k.startsWith("$")));
  const result = { $generated: "by scripts/layout.mjs from " + rel.split("/").pop() + " — do not edit", metrics: METRICS, graphs: {} };
  const errs = [], warns = [];
  for (const name of names) {
    const v = validate(name, spec[name], names, icons);
    errs.push(...v.errors); warns.push(...v.warnings);
    if (v.errors.length) continue;
    try {
      const { out, warnings } = await layoutGraph(name, v.graph);
      warns.push(...warnings);
      const { flows, errors } = resolveFlows(name, v.graph, out);
      errs.push(...errors);
      result.graphs[name] = { ...out, flows };
    } catch (e) { errs.push(String(e.message ?? e)); }
  }
  for (const w of warns) console.warn(`⚠ ${rel}: ${w}`);
  if (errs.length) {
    failed = true;
    console.error(`✖ ${rel}: ${errs.length} error${errs.length > 1 ? "s" : ""}`);
    for (const e of errs) console.error(`  - ${e}`);
    continue;
  }
  const outFile = file.replace(/\.graph\.json$/, ".layout.json");
  const text = JSON.stringify(result, null, 1) + "\n";
  if (CHECK) { console.log(`✓ ${rel} (${Object.keys(result.graphs).join(", ")})`); continue; }
  if (!existsSync(outFile) || readFileSync(outFile, "utf8") !== text) writeFileSync(outFile, text);
  console.log(`layout: ${relative(ROOT, outFile)} (${Object.entries(result.graphs).map(([n, g]) => `${n} ${g.width}×${g.height}`).join(", ")})`);
}
if (failed) process.exit(1);
