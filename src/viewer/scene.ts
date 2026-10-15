// src/viewer/scene.ts
// The only module that imports three; Viewer loads it with import("./scene").
import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh as ThreeMesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  TOUCH,
  Vector2,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TraySpec } from "../model/types";
import { SPARE_COLOR } from "../ui/identity";
import type { ViewBasis } from "./axes";
import { anchorOf, isVisible, outlineCenter, trayPosition } from "./transform";
import type { BoxOutline, SceneFactory, SceneHandle, SceneTray } from "./types";
import { WebGLUnavailableError } from "./webgl";

interface TrayObject {
  spec: TraySpec;
  // The part this one is spread apart with: a card spacer travels with its tray, everything
  // else with itself.
  anchor: TraySpec;
  object: ThreeMesh;
  material: MeshStandardMaterial;
}

const CLICK_SLOP_PX = 5;

/** Frees the renderer and, since browsers keep only a few, the WebGL context behind it. */
/** A tint as a lit surface needs it: the dark-scheme tints are lifted so the shading shows. */
function litColor(css: string): Color {
  const c = new Color(css);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return hsl.l < 0.4 ? c.setHSL(hsl.h, Math.min(1, hsl.s + 0.1), hsl.l + 0.25) : c;
}

function release(renderer: WebGLRenderer): void {
  renderer.dispose();
  renderer.forceContextLoss();
}

export const createScene: SceneFactory = (canvas) => {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    throw new WebGLUnavailableError(e instanceof Error ? e.message : String(e));
  }
  try {
    return buildScene(canvas, renderer);
  } catch (e) {
    release(renderer);
    throw e;
  }
};

function buildScene(canvas: HTMLCanvasElement, renderer: WebGLRenderer): SceneHandle {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 1, 10000);
  camera.up.set(0, 0, 1);
  camera.position.set(150, -300, 300);
  const controls = new OrbitControls(camera, canvas);
  // The controls switch the canvas to touch-action: none, which would trap a phone's page scroll
  // on this full-width canvas. One finger scrolls the page (a tap still picks a tray); two
  // fingers zoom and turn. The mouse keeps drag to turn, wheel to zoom.
  canvas.style.touchAction = "pan-y";
  controls.touches = { ONE: null, TWO: TOUCH.DOLLY_ROTATE };
  scene.add(new AmbientLight(0xffffff, 0.7));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(-1, -2, 3);
  scene.add(sun);

  let trays: TrayObject[] = [];
  let outline: { line: LineSegments; material: LineBasicMaterial } | null = null;
  let explode = 0;
  let center: [number, number] | undefined;
  let maxLevel: number | null = null;
  let selected: string | null = null;
  let pick: ((key: string | null) => void) | null = null;
  let viewCb: ((view: ViewBasis) => void) | null = null;
  let frameId = 0;
  let down: { x: number; y: number } | null = null;
  const raycaster = new Raycaster();

  const draw = (): void => {
    frameId = 0;
    renderer.render(scene, camera);
  };
  const requestDraw = (): void => {
    if (frameId === 0) {
      frameId = requestAnimationFrame(draw);
    }
  };
  // The camera's own axes are the columns of its world matrix (right, up, back).
  function emitView(): void {
    if (!viewCb) {
      return;
    }
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    viewCb({
      right: [e[0] ?? 0, e[1] ?? 0, e[2] ?? 0],
      up: [e[4] ?? 0, e[5] ?? 0, e[6] ?? 0],
      back: [e[8] ?? 0, e[9] ?? 0, e[10] ?? 0],
    });
  }
  const onControlsChange = (): void => {
    requestDraw();
    emitView();
  };
  controls.addEventListener("change", onControlsChange);

  function apply(): void {
    for (const t of trays) {
      const [x, y, z] = trayPosition(t.spec, explode, center, t.anchor);
      t.object.position.set(x, y, z);
      t.object.visible = isVisible(t.spec, maxLevel);
      t.material.emissive.setHex(t.spec.key === selected ? 0x444444 : 0x000000);
    }
    requestDraw();
  }

  function clearTrays(): void {
    for (const t of trays) {
      scene.remove(t.object);
      t.object.geometry.dispose();
      t.material.dispose();
    }
    trays = [];
  }

  function clearOutline(): void {
    if (outline) {
      scene.remove(outline.line);
      outline.line.geometry.dispose();
      outline.material.dispose();
      outline = null;
    }
  }

  const onPointerDown = (e: PointerEvent): void => {
    // Only a primary-button press by the primary pointer can become a click: a right-click or
    // the second finger of a pinch must not pick a tray.
    down = e.button === 0 && e.isPrimary ? { x: e.clientX, y: e.clientY } : null;
  };
  const onPointerCancel = (): void => {
    down = null;
  };
  const onPointerUp = (e: PointerEvent): void => {
    const start = down;
    down = null;
    if (!start || !pick || Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP_PX) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const visible = trays.filter((t) => t.object.visible).map((t) => t.object);
    const hit = raycaster.intersectObjects(visible, false)[0];
    const found = hit ? trays.find((t) => t.object === hit.object) : undefined;
    pick(found ? found.spec.key : null);
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);

  const handle: SceneHandle = {
    setBox(o: BoxOutline) {
      clearOutline();
      const [w, d, h] = o.size;
      const [x0, y0, z0] = o.min;
      center = outlineCenter(o);
      const solid = new BoxGeometry(w, d, h);
      const edges = new EdgesGeometry(solid);
      solid.dispose();
      const material = new LineBasicMaterial({ color: 0x888888 });
      const line = new LineSegments(edges, material);
      line.position.set(x0 + w / 2, y0 + d / 2, z0 + h / 2);
      scene.add(line);
      outline = { line, material };
      const dist = Math.max(w, d, h) * 1.6;
      controls.target.set(x0 + w / 2, y0 + d / 2, z0 + h / 2);
      camera.position.set(x0 + w / 2, y0 + d / 2 - dist, z0 + h / 2 + dist * 0.9);
      camera.far = dist * 10;
      camera.updateProjectionMatrix();
      controls.update();
      emitView();
      apply();
    },
    setTrays(list: readonly SceneTray[]) {
      clearTrays();
      const byKey = new Map(list.map(({ spec }) => [spec.key, spec]));
      list.forEach(({ spec, mesh, color }) => {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
        geometry.setIndex(new BufferAttribute(mesh.indices, 1));
        geometry.computeVertexNormals();
        // A part with no colour of its own takes the neutral, not a hue of its own: colour here
        // means "this is that component", so an invented one would claim an identity it hasn't got.
        const material = new MeshStandardMaterial({
          color: litColor(color ?? SPARE_COLOR),
          flatShading: true,
          roughness: 0.8,
        });
        const object = new ThreeMesh(geometry, material);
        scene.add(object);
        const anchor = anchorOf(spec, byKey);
        trays.push({ spec, anchor, object, material });
      });
      apply();
    },
    setExplode(f) {
      explode = f;
      apply();
    },
    setMaxLevel(level) {
      maxLevel = level;
      apply();
    },
    setSelected(key) {
      selected = key;
      apply();
    },
    onPick(cb) {
      pick = cb;
    },
    onView(cb) {
      viewCb = cb;
      emitView();
    },
    resize(width, height) {
      if (width <= 0 || height <= 0) {
        return;
      }
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestDraw();
    },
    dispose() {
      if (frameId !== 0) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      controls.removeEventListener("change", onControlsChange);
      controls.dispose();
      clearTrays();
      clearOutline();
      release(renderer);
      pick = null;
      viewCb = null;
    },
  };
  return handle;
}
