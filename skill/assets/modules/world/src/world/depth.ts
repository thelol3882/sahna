/**
 * Optional WebGL depth layer behind the panels (showcase only): a sparse star field, a faint grid floor one level
 * below the lowest panel, a slowly turning wireframe icosahedron far behind, and one soft light.
 * Same camera as the CSS panels (see math.ts): it renders only while the camera moves or the overview is open;
 * at rest the active panel covers the whole stage, so the loop stops and the canvas is hidden.
 */
import * as THREE from "three";
import { viewNoP, type Pose, type Vec3 } from "./math";

export type DepthColors = { bg: string; star: string; accent: string; grid: string };

export class DepthLayer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private ico: THREE.LineSegments;
  private disposed = false;

  constructor(readonly canvas: HTMLCanvasElement, P: number, bounds: { min: Vec3; max: Vec3 }, c: DepthColors) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(new THREE.Color(c.bg), 1);
    // same projection as CSS perspective(P) on a 1920×1080 stage
    const fov = (2 * Math.atan(540 / P) * 180) / Math.PI;
    this.camera = new THREE.PerspectiveCamera(fov, 1920 / 1080, 20, 90000);
    this.camera.matrixAutoUpdate = false;
    this.scene.fog = new THREE.Fog(new THREE.Color(c.bg), 4000, 42000);

    const to3 = (v: Vec3) => new THREE.Vector3(v[0], -v[1], v[2]); // CSS y down → three y up
    const [x0, y0, z0] = bounds.min, [x1, y1, z1] = bounds.max;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

    // stars: sparse, mostly far, a few brighter ones
    const N = 1400, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const star = new THREE.Color(c.star);
    for (let i = 0; i < N; i++) {
      const p = to3([cx + (rnd() - 0.5) * 60000, (y0 + y1) / 2 + (rnd() - 0.5) * 30000, z1 + 6000 - rnd() * (z1 - z0 + 40000)]);
      pos.set([p.x, p.y, p.z], i * 3);
      const k = 0.35 + 0.65 * Math.pow(rnd(), 3);
      col.set([star.r * k, star.g * k, star.b * k], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    sg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: true })));

    // grid floor one level below the lowest panel
    const span = Math.max(x1 - x0, z1 - z0) + 40000;
    const grid = new THREE.GridHelper(span, Math.round(span / 900), new THREE.Color(c.grid), new THREE.Color(c.grid));
    (grid.material as THREE.LineBasicMaterial).transparent = true;
    (grid.material as THREE.LineBasicMaterial).opacity = 0.55;
    grid.position.copy(to3([cx, y1 + 1500, cz]));
    this.scene.add(grid);

    // one abstract object, far behind the world, turning slowly
    const ico = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(3200, 1)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(c.accent), transparent: true, opacity: 0.22, fog: false }),
    );
    ico.position.copy(to3([x0 - 2500, y0 - 1800, z0 - 9000]));
    this.ico = ico;
    this.scene.add(ico);

    // a soft light behind the world centre
    const g = document.createElement("canvas");
    g.width = g.height = 256;
    const ctx = g.getContext("2d")!;
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, c.accent);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(g), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.scale.set(30000, 30000, 1);
    glow.position.copy(to3([cx, (y0 + y1) / 2, z0 - 14000]));
    this.scene.add(glow);
  }

  /** drawing-buffer pixels per stage px (stage scale × devicePixelRatio): rendered at 60 % and capped at 1,
   *  because the layer is soft background (stars, fogged lines) and fill rate is its only real cost */
  resize(pxPerStagePx: number) {
    this.renderer.setPixelRatio(Math.min(pxPerStagePx * 0.6, 1));
    this.renderer.setSize(1920, 1080, false);
  }

  render(cam: Pose, timeSec: number) {
    if (this.disposed) return;
    // three view = S · Rᵀ · T(−eye) · S, S = diag(1, −1, 1)
    const v = viewNoP(cam);
    const m = new THREE.Matrix4().fromArray(Array.from(v));
    const S = new THREE.Matrix4().makeScale(1, -1, 1);
    const view = S.clone().multiply(m).multiply(S);
    this.camera.matrix.copy(view).invert();
    this.camera.updateMatrixWorld(true);
    this.ico.rotation.set(timeSec * 0.021, timeSec * 0.034, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() { this.disposed = true; this.renderer.dispose(); }
}

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}
