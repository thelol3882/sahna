// Build-time map compiler: GeoJSON + config → projected SVG paths (JSON). d3-geo is a devDependency only;
// the deck ships plain path strings and pixel coordinates.
//   node scripts/geo-build.mjs geo/kz.config.json
import fs from "node:fs";
import path from "node:path";
import * as d3 from "d3-geo";

const cfgPath = process.argv[2];
if (!cfgPath) { console.error("usage: node scripts/geo-build.mjs <config.json>"); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const geo = JSON.parse(fs.readFileSync(cfg.input, "utf8"));
const [W, H] = cfg.size;
const pad = cfg.padding ?? 0;

const feats = geo.features.filter((f) => !cfg.ids || cfg.ids[f.properties[cfg.idField]]);
const fc = { type: "FeatureCollection", features: feats };
const P = cfg.projection;
let proj = d3[P.type]();
if (P.parallels && proj.parallels) proj = proj.parallels(P.parallels);
if (P.rotate) proj = proj.rotate(P.rotate);
if (P.center) proj = proj.center(P.center);
proj = proj.fitExtent([[pad, pad], [W - pad, H - pad]], fc);
const pathGen = d3.geoPath(proj);

// Douglas–Peucker on projected rings (pixels)
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = (r) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
const r1 = (v) => Math.round(v * 10) / 10;

const regions = feats.map((f) => {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let d = "";
  for (const poly of polys) {
    // dropHoles: interior rings (enclaves such as Baikonur, or a city drawn as its own feature on top) are filled
    for (const ring of cfg.dropHoles ? poly.slice(0, 1) : poly) {
      const raw = ring.map((c) => proj(c));
      // closed ring: split at the point farthest from the start, simplify both halves
      let far = 0, fd = -1;
      raw.forEach((p, i) => { const dd = Math.hypot(p[0] - raw[0][0], p[1] - raw[0][1]); if (dd > fd) { fd = dd; far = i; } });
      const tol = cfg.tolerance ?? 0.5;
      const pts = [...simplify(raw.slice(0, far + 1), tol), ...simplify(raw.slice(far), tol).slice(1)];
      if (pts.length < 4 || area(pts) < (cfg.minRingArea ?? 0)) continue;
      d += "M" + pts.slice(0, -1).map((p) => `${r1(p[0])},${r1(p[1])}`).join("L") + "Z";
    }
  }
  const [cx, cy] = pathGen.centroid(f);
  const [[x0, y0], [x1, y1]] = pathGen.bounds(f);
  return { id: cfg.ids ? cfg.ids[f.properties[cfg.idField]] : String(f.properties[cfg.idField]), d,
    cx: r1(cx), cy: r1(cy), bbox: [r1(x0), r1(y0), r1(x1), r1(y1)], area: Math.round(pathGen.area(f)) };
});
// small regions (cities) last so they draw on top of the region that surrounds them
regions.sort((a, b) => b.area - a.area);

const places = Object.fromEntries((cfg.places ?? []).map((p) => {
  const [x, y] = proj([p.lon, p.lat]);
  return [p.id, { x: r1(x), y: r1(y), lon: p.lon, lat: p.lat }];
}));

const out = { width: W, height: H, source: cfg.source ?? "", projection: P, regions, places };
fs.mkdirSync(path.dirname(cfg.output), { recursive: true });
fs.writeFileSync(cfg.output, JSON.stringify(out));
console.log(`${cfg.output}: ${regions.length} regions, ${Object.keys(places).length} places, ${(fs.statSync(cfg.output).size / 1024).toFixed(1)} KB`);
