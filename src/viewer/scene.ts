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
  MeshLambertMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Scene,
  TOUCH,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TraySpec } from "../model/types";
import { SPACER_SHADE } from "../ui/identity";
import {
  DIM_TOWARD_HEX,
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
import {
  AMBIENT_INTENSITY,
  SUN_DIRECTION,
  SUN_INTENSITY,
  fadedColor,
  hexOf,
  litColor,
} from "./colors";
import {
  CAMERA_FOV,
  boxRadius,
  cornersOf,
  fitDistance,
  modelRadius,
  ndcOf,
  orthoHalfHeight,
  outlineTarget,
} from "./fit";
import type { Vec3 } from "./fit";
import { keepsView } from "./view";
import type { Projection, ViewState } from "./view";
import { BODY, groupTriangles, wellOfTriangles } from "./wells";
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
  /**
   * One material per colour the part is drawn in: the body's first, then each distinct colour its
   * wells are drawn in inside (the mesh's triangle groups index them). A part with no coloured well
   * has the body's alone.
   */
  materials: MeshLambertMaterial[];
  /**
   * The tray drawn into depth only, just before the tray itself while it is drawn through: without
   * it a see-through tray's far walls and wells blend over its near faces in whatever order the
   * triangles come, and it reads as turned inside out. With it only the nearest face blends.
   */
  depth: ThreeMesh;
  /** Each material's own colour (same order): what it shows at full strength, before any fade toward the page. */
  bases: Color[];
}

const CLICK_SLOP_PX = 5;

/** The tray that does not fit stands this far out of its slot, mm, and takes this share of the warn colour. */
const MISFIT_LIFT_MM = 20;
const MISFIT_TINT = 0.75;
const MISFIT_COLOR = 0xc2620f;

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
const OPENING_VIEW: Vec3 = (() => {
  const unit = Math.hypot(1, 0.9);
  return [0, -1 / unit, 0.9 / unit];
})();

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
  // Both cameras exist for the scene's life and the controls take whichever is shown (`projection`).
  const perspective = new PerspectiveCamera(CAMERA_FOV, 1, 1, 10000);
  const orthographic = new OrthographicCamera(-100, 100, 100, -100, 1, 10000);
  for (const c of [perspective, orthographic]) {
    c.up.set(0, 0, 1);
    c.position.set(150, -300, 300);
  }
  let projection: Projection = "perspective";
  let camera = perspective as PerspectiveCamera | OrthographicCamera;
  const controls = new OrbitControls(camera, canvas);
  // The camera turns and zooms about the middle of the box and never slides off it: the fit (fit.ts)
  // holds for a sphere about that point only.
  controls.enablePan = false;
  // The controls switch the canvas to touch-action: none, which would trap a phone's page scroll
  // on this full-width canvas. One finger scrolls the page (a tap still picks a tray); two
  // fingers zoom and turn. The mouse keeps drag to turn, wheel to zoom.
  canvas.style.touchAction = "pan-y";
  controls.touches = { ONE: null, TWO: TOUCH.DOLLY_ROTATE };
  scene.add(new AmbientLight(0xffffff, AMBIENT_INTENSITY));
  const sun = new DirectionalLight(0xffffff, SUN_INTENSITY);
  sun.position.set(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z);
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
  let misfit: string | null = null;
  const warnColor = new Color(MISFIT_COLOR);
  const pageColor = new Color(PAGE_HEX);
  const dimColor = new Color(DIM_TOWARD_HEX);
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
      const lift = t.spec.key === misfit ? MISFIT_LIFT_MM : 0;
      t.object.position.set(x, y, z - t.below + lift);
      t.object.visible = isVisible(t.spec, maxLevel);
      const glow = emissiveOf(t.spec.key, selected, lit, edited);
      const fade = fadeOf(t.spec.key, selected, lit, edited);
      // The faded trays of an edited item are drawn through, so the item's own show behind them.
      const opacity = opacityOf(t.spec.key, selected, lit, edited);
      t.materials.forEach((material, i) => {
        material.emissive.setHex(glow);
        const base = t.bases[i] ?? t.bases[0] ?? pageColor;
        // a dimmed tray goes the way the plan's does (toward the box it stands in); the edited item's others are drawn through over the page
        fadedColor(material.color, base, edited ? pageColor : dimColor, fade);
        if (t.spec.key === misfit) {
          // The tray that does not fit is tinted in the warn colour, wells and all.
          material.color.copy(base).lerp(warnColor, MISFIT_TINT);
        }
        material.opacity = opacity;
        material.transparent = opacity < 1;
        material.depthWrite = opacity === 1;
      });
      t.depth.visible = opacity < 1;
    }
    requestDraw();
  }

  /** The sphere about the middle of the box that holds the model, spread as far as it is (0: no box yet). */
  function wantedRadius(): number {
    return framed === null
      ? 0
      : modelRadius(
          framed,
          trays.map(({ spec, anchor }) => ({ spec, anchor })),
          explode,
        );
  }

  /** The distance from the middle of the box at which the model, spread as far as it is, is in frame. */
  function wantedDistance(): number {
    return framed === null ? 0 : fitDistance(wantedRadius(), aspect);
  }

  /**
   * Sets the shown camera's frame: the field of view follows the frame's shape; the orthographic
   * camera's box is the sphere's size (it has no distance to fit by) over its zoom.
   */
  function updateProjection(): void {
    if (camera === orthographic) {
      const radius = wantedRadius();
      if (radius > 0) {
        const half = orthoHalfHeight(radius, aspect);
        orthographic.top = half;
        orthographic.bottom = -half;
        orthographic.left = -half * aspect;
        orthographic.right = half * aspect;
      }
    } else {
      perspective.aspect = aspect;
    }
    camera.updateProjectionMatrix();
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
    updateProjection();
    controls.update();
  }

  /** Where the camera stands now, as shares of the fit (view.ts ViewState). */
  function currentView(): ViewState {
    const offset = camera.position.clone().sub(controls.target);
    const dist = offset.length();
    const unit = dist > 0 ? offset.divideScalar(dist) : new Vector3(...OPENING_VIEW);
    return {
      direction: [unit.x, unit.y, unit.z],
      share: fitted > 0 ? dist / fitted : 1,
      zoom: orthographic.zoom,
      projection,
      boxRadius: framed === null ? 0 : boxRadius(framed),
      explode,
    };
  }

  /** Puts the shown camera where `direction`, `share` of the fit away and `zoom` say, about the box's middle. */
  function placeCamera(direction: Vec3, share: number, zoom: number): void {
    if (framed === null) {
      return;
    }
    const [tx, ty, tz] = outlineTarget(framed);
    const dist = wantedDistance();
    controls.target.set(tx, ty, tz);
    camera.position.set(
      tx + direction[0] * dist * share,
      ty + direction[1] * dist * share,
      tz + direction[2] * dist * share,
    );
    orthographic.zoom = zoom;
    fitted = dist;
    camera.far = dist * 10;
    updateProjection();
    controls.update();
  }

  /**
   * Shows the other camera from the same side at the same apparent size: a perspective camera
   * that is `share` of the fit away is an orthographic one zoomed by 1 / share, and back.
   */
  function showProjection(next: Projection): void {
    if (next === projection) {
      return;
    }
    if (framed === null) {
      // Nothing is framed yet: the camera that is shown changes, and the box's frame places it.
      projection = next;
      camera = next === "orthographic" ? orthographic : perspective;
      controls.object = camera;
      return;
    }
    const was = camera;
    const apparent = projection === "perspective" ? currentView().share : 1 / orthographic.zoom;
    const dir = was.position.clone().sub(controls.target).normalize();
    projection = next;
    camera = next === "orthographic" ? orthographic : perspective;
    controls.object = camera;
    camera.position
      .copy(controls.target)
      .addScaledVector(dir, fitted * (next === "orthographic" ? 1 : apparent));
    camera.quaternion.copy(was.quaternion);
    orthographic.zoom = next === "orthographic" ? 1 / apparent : 1;
    camera.far = Math.max(fitted, 1) * 10;
    updateProjection();
    controls.update();
    requestDraw();
  }

  function clearTrays(): void {
    for (const t of trays) {
      scene.remove(t.object);
      t.object.geometry.dispose();
      t.materials.forEach((m) => m.dispose());
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
      Object.fromEntries(trays.map((t) => [t.spec.key, t.materials[0]?.emissive.getHex() ?? 0])),
    tints: () => ({
      page: PAGE_HEX,
      trays: Object.fromEntries(
        trays.map((t) => [
          t.spec.key,
          {
            color: hexOf(t.materials[0]?.color ?? pageColor),
            base: hexOf(t.bases[0] ?? pageColor),
            opacity: t.materials[0]?.opacity ?? 1,
            wells: t.bases.slice(1).map(hexOf),
          },
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
      const framedBefore = framed;
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
      // A box of about the same size keeps the view (the turn, the zoom, the projection) and is
      // framed as before; one of another size starts it again from the opening place.
      const was = currentView();
      const keep = framedBefore !== null && keepsView(boxRadius(framedBefore), boxRadius(o));
      framed = o;
      if (keep) {
        placeCamera(was.direction, was.share, was.zoom);
      } else {
        placeCamera(OPENING_VIEW, 1, 1);
      }
      apply();
    },
    setTrays(list: readonly SceneTray[]) {
      clearTrays();
      const byKey = new Map(list.map(({ spec }) => [spec.key, spec]));
      list.forEach(({ spec, mesh, color, wells, below }) => {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
        geometry.setIndex(new BufferAttribute(mesh.indices, 1));
        geometry.computeVertexNormals();
        // A part with no colour of its own takes the neutral, not a hue of its own: colour here
        // means "this is that component" (its shade, as in the top view), so an invented one
        // would claim an identity it hasn't got.
        const colors = [litColor(color ?? SPACER_SHADE.light.fill)];
        // The wells' own colours: the triangles inside each compartment are drawn in its colour,
        // as a draw range of the same index buffer, so the mesh itself is not touched.
        const wellColors = [...new Set(wells ?? [])];
        if (wellColors.length > 0) {
          const inWell = wellOfTriangles(spec, mesh, below ?? 0);
          const classes = Array.from(inWell, (w) => {
            const hex = w === BODY ? undefined : wells?.[w];
            return hex === undefined ? 0 : wellColors.indexOf(hex) + 1;
          });
          const { indices, groups } = groupTriangles(mesh.indices, classes, wellColors.length + 1);
          if (groups.length > 1) {
            const used = groups.map((g) => g.cls);
            colors.length = 0;
            used.forEach((cls) => {
              const hex = wellColors[cls - 1];
              colors.push(
                litColor(cls === 0 || hex === undefined ? (color ?? SPACER_SHADE.light.fill) : hex),
              );
            });
            geometry.setIndex(new BufferAttribute(indices, 1));
            groups.forEach((g, i) => geometry.addGroup(g.start, g.count, i));
          }
        }
        const bases = colors;
        const materials = bases.map(
          (c) => new MeshLambertMaterial({ color: c.clone(), flatShading: true }),
        );
        const object = new ThreeMesh(geometry, materials.length > 1 ? materials : materials[0]);
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
        trays.push({ spec, anchor, object, materials, depth, bases, below: below ?? 0 });
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
    setMisfit(key) {
      misfit = key;
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
      updateProjection();
      refit();
      requestDraw();
    },
    setProjection(next) {
      showProjection(next);
    },
    getView() {
      return currentView();
    },
    setView(view) {
      if (framed === null || !keepsView(view.boxRadius, boxRadius(framed))) {
        return false;
      }
      showProjection(view.projection);
      placeCamera(view.direction, view.share, view.zoom);
      requestDraw();
      return true;
    },
    resetView() {
      placeCamera(OPENING_VIEW, 1, 1);
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
