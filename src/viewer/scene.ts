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
  MeshBasicMaterial,
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
import { SPACER_SHADE } from "../ui/identity";
import {
  PAGE_HEX,
  anchorOf,
  emissiveOf,
  fadeOf,
  isVisible,
  opacityOf,
  outlineCenter,
  trayPosition,
} from "./transform";
import type { BoxOutline, SceneFactory, SceneHandle, SceneTray } from "./types";
import { cornersOf, fitDistance, modelRadius, ndcOf, outlineTarget } from "./fit";
import { exposeShotsScene } from "./shotsScene";
import { WebGLUnavailableError } from "./webgl";

interface TrayObject {
  spec: TraySpec;
  // The part this one is spread apart with: a card spacer travels with its tray, everything
  // else with itself.
  anchor: TraySpec;
  /** SceneTray.below: the mesh's bed face is this far under the spec's z. */
  below: number;
  object: ThreeMesh;
  material: MeshStandardMaterial;
  /**
   * The tray drawn into depth only, just before the tray itself while it is drawn through: without
   * it a see-through tray's far walls and wells blend over its near faces in whatever order the
   * triangles come, and it reads as turned inside out. With it only the nearest face blends.
   */
  depth: ThreeMesh;
  /** The tray's own colour: what it shows at full strength, before any fade toward the page. */
  base: Color;
}

const CLICK_SLOP_PX = 5;

/**
 * The ghost slab of an area kept free on top: the box outline's neutral grey (0x888888), as a
 * faint fill with its edges, so it reads as space, not as a part (no part is this colour or this
 * clear).
 */
const SLAB_COLOR = 0x888888;
const SLAB_OPACITY = 0.18;

/**
 * The camera's first place, as a direction from the middle of the box (y toward the front, z up):
 * in front of it and above, as the view has always opened. Its length is the fit's, not this one's.
 */
const OPENING_VIEW = { y: -1, z: 0.9 };

/** A shade as a lit surface needs it: the dark-scheme shades are lifted so the shading shows. */
function litColor(css: string): Color {
  const c = new Color(css);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return hsl.l < 0.4 ? c.setHSL(hsl.h, Math.min(1, hsl.s + 0.1), hsl.l + 0.25) : c;
}

/** A colour as "#rrggbb", for the shots window. */
function hexOf(c: Color): string {
  return "#".concat(c.getHexString());
}

/** Frees the renderer and, since browsers keep only a few, the WebGL context behind it. */
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
  // The camera turns and zooms about the middle of the box and never slides off it: the fit (fit.ts)
  // holds for a sphere about that point only.
  controls.enablePan = false;
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
  // The kept-free slabs (setReserved): a translucent fill and its edges each. Not in `trays`, so
  // never picked, never faded or hidden by the Layer cut, and not in the fit.
  let slabs: {
    fill: ThreeMesh;
    edges: LineSegments;
    materials: (MeshBasicMaterial | LineBasicMaterial)[];
  }[] = [];
  let outline: { line: LineSegments; material: LineBasicMaterial } | null = null;
  // The box the camera is fitted to, and the distance it was last fitted at (0: not yet).
  let framed: BoxOutline | null = null;
  let fitted = 0;
  // The frame's width over its height: the horizontal field of view follows it.
  let aspect = 1;
  let explode = 0;
  let center: [number, number] | undefined;
  let maxLevel: number | null = null;
  let selected: string | null = null;
  let lit: ReadonlySet<string> = new Set();
  let edited = false;
  const pageColor = new Color(PAGE_HEX);
  let pick: ((key: string | null) => void) | null = null;
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
  const onControlsChange = (): void => {
    requestDraw();
  };
  controls.addEventListener("change", onControlsChange);

  function apply(): void {
    for (const t of trays) {
      const [x, y, z] = trayPosition(t.spec, explode, center, t.anchor);
      t.object.position.set(x, y, z - t.below);
      t.object.visible = isVisible(t.spec, maxLevel);
      t.material.emissive.setHex(emissiveOf(t.spec.key, selected, lit, edited));
      t.material.color.copy(t.base).lerp(pageColor, fadeOf(t.spec.key, selected, lit, edited));
      // The faded trays of an edited item are drawn through, so the item's own show behind them.
      const opacity = opacityOf(t.spec.key, selected, lit, edited);
      t.material.opacity = opacity;
      t.material.transparent = opacity < 1;
      t.material.depthWrite = opacity === 1;
      t.depth.visible = opacity < 1;
    }
    requestDraw();
  }

  /** The distance from the middle of the box at which the model, spread as far as it is, is in frame. */
  function wantedDistance(): number {
    return framed === null
      ? 0
      : fitDistance(
          modelRadius(
            framed,
            trays.map(({ spec, anchor }) => ({ spec, anchor })),
            explode,
          ),
          aspect,
        );
  }

  /**
   * Moves the camera along its line of sight to the distance the model needs now (it spreads
   * apart, the frame is resized): the turn is kept, and so is a zoom the person made, as the same
   * share of the fit.
   */
  function refit(): void {
    const wanted = wantedDistance();
    if (wanted === 0) {
      return;
    }
    if (fitted > 0 && Math.abs(wanted - fitted) > 1e-6) {
      camera.position
        .sub(controls.target)
        .multiplyScalar(wanted / fitted)
        .add(controls.target);
    }
    fitted = wanted;
    camera.far = wanted * 10;
    camera.updateProjectionMatrix();
    controls.update();
  }

  function clearTrays(): void {
    for (const t of trays) {
      scene.remove(t.object);
      t.object.geometry.dispose();
      t.material.dispose();
      (t.depth.material as MeshBasicMaterial).dispose();
    }
    trays = [];
  }

  function clearSlabs(): void {
    for (const s of slabs) {
      scene.remove(s.fill);
      scene.remove(s.edges);
      s.fill.geometry.dispose();
      s.edges.geometry.dispose();
      s.materials.forEach((m) => m.dispose());
    }
    slabs = [];
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

  // Shots mode only: lets the harness read which trays glow (shotsScene.ts).
  const dropShotsScene = exposeShotsScene({
    emissive: () =>
      Object.fromEntries(trays.map((t) => [t.spec.key, t.material.emissive.getHex()])),
    tints: () => ({
      page: PAGE_HEX,
      trays: Object.fromEntries(
        trays.map((t) => [
          t.spec.key,
          { color: hexOf(t.material.color), base: hexOf(t.base), opacity: t.material.opacity },
        ]),
      ),
    }),
    framing: () => {
      camera.updateMatrixWorld();
      const view = camera.matrixWorldInverse.elements;
      const projection = camera.projectionMatrix.elements;
      const points = [
        ...(framed === null ? [] : cornersOf(framed.min, framed.size)),
        ...trays
          .filter((t) => t.object.visible)
          .flatMap((t) =>
            cornersOf(trayPosition(t.spec, explode, center, t.anchor), [
              t.spec.w,
              t.spec.d,
              t.spec.h,
            ]),
          ),
      ];
      return {
        overflow: Math.max(
          0,
          ...points.flatMap((p) => ndcOf(view, projection, p).map((v) => Math.abs(v))),
        ),
      };
    },
  });

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
      // A new box starts the view again: the opening direction, at the distance that fits the model.
      framed = o;
      const [tx, ty, tz] = outlineTarget(o);
      const dist = wantedDistance();
      const unit = Math.hypot(OPENING_VIEW.y, OPENING_VIEW.z);
      controls.target.set(tx, ty, tz);
      camera.position.set(
        tx,
        ty + (OPENING_VIEW.y / unit) * dist,
        tz + (OPENING_VIEW.z / unit) * dist,
      );
      fitted = dist;
      camera.far = dist * 10;
      camera.updateProjectionMatrix();
      controls.update();
      apply();
    },
    setTrays(list: readonly SceneTray[]) {
      clearTrays();
      const byKey = new Map(list.map(({ spec }) => [spec.key, spec]));
      list.forEach(({ spec, mesh, color, below }) => {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
        geometry.setIndex(new BufferAttribute(mesh.indices, 1));
        geometry.computeVertexNormals();
        // A part with no colour of its own takes the neutral, not a hue of its own: colour here
        // means "this is that component" (its shade, as in the top view), so an invented one
        // would claim an identity it hasn't got.
        const base = litColor(color ?? SPACER_SHADE.light.fill);
        const material = new MeshStandardMaterial({
          color: base.clone(),
          flatShading: true,
          roughness: 0.8,
        });
        const object = new ThreeMesh(geometry, material);
        // Both are drawn with the see-through trays, after the solid ones: the depth first.
        const depth = new ThreeMesh(
          geometry,
          new MeshBasicMaterial({ colorWrite: false, transparent: true }),
        );
        depth.renderOrder = 1;
        object.renderOrder = 2;
        depth.visible = false;
        depth.raycast = () => undefined;
        object.add(depth);
        scene.add(object);
        const anchor = anchorOf(spec, byKey);
        trays.push({ spec, anchor, object, material, depth, base, below: below ?? 0 });
      });
      refit();
      apply();
    },
    setReserved(list) {
      clearSlabs();
      for (const { min, size } of list ?? []) {
        const [w, d, h] = size;
        const solid = new BoxGeometry(w, d, h);
        const edgeGeometry = new EdgesGeometry(solid);
        const fillMaterial = new MeshBasicMaterial({
          color: SLAB_COLOR,
          transparent: true,
          opacity: SLAB_OPACITY,
          depthWrite: false,
        });
        const edgeMaterial = new LineBasicMaterial({ color: SLAB_COLOR });
        const fill = new ThreeMesh(solid, fillMaterial);
        const edges = new LineSegments(edgeGeometry, edgeMaterial);
        for (const o of [fill, edges]) {
          o.position.set(min[0] + w / 2, min[1] + d / 2, min[2] + h / 2);
          o.raycast = () => undefined;
          scene.add(o);
        }
        // After the trays and their depth passes, so the see-through fill blends over them.
        fill.renderOrder = 3;
        edges.renderOrder = 3;
        slabs.push({ fill, edges, materials: [fillMaterial, edgeMaterial] });
      }
      requestDraw();
    },
    setExplode(f) {
      explode = f;
      refit();
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
    setLit(keys, asEdited = false) {
      lit = new Set(keys);
      edited = asEdited;
      apply();
    },
    onPick(cb) {
      pick = cb;
    },
    resize(width, height) {
      if (width <= 0 || height <= 0) {
        return;
      }
      renderer.setSize(width, height, false);
      aspect = width / height;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      refit();
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
      clearSlabs();
      release(renderer);
      dropShotsScene();
      pick = null;
    },
  };
  return handle;
}
