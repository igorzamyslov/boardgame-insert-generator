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
  Vector2,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TraySpec } from "../model/types";
import { isVisible, trayColor, trayPosition } from "./transform";
import type { BoxOutline, SceneFactory, SceneHandle, SceneTray } from "./types";

interface TrayObject {
  spec: TraySpec;
  object: ThreeMesh;
  material: MeshStandardMaterial;
}

const CLICK_SLOP_PX = 5;

export const createScene: SceneFactory = (canvas) => {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 1, 10000);
  camera.up.set(0, 0, 1);
  camera.position.set(150, -300, 300);
  const controls = new OrbitControls(camera, canvas);
  scene.add(new AmbientLight(0xffffff, 0.7));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(-1, -2, 3);
  scene.add(sun);

  let trays: TrayObject[] = [];
  let outline: { line: LineSegments; material: LineBasicMaterial } | null = null;
  let explode = 0;
  let maxLevel: number | null = null;
  let selected: string | null = null;
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
  controls.addEventListener("change", requestDraw);

  function apply(): void {
    for (const t of trays) {
      const [x, y, z] = trayPosition(t.spec, explode);
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
    down = { x: e.clientX, y: e.clientY };
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

  const handle: SceneHandle = {
    setBox(o: BoxOutline) {
      clearOutline();
      const [w, d, h] = o.size;
      const [x0, y0, z0] = o.min;
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
      requestDraw();
    },
    setTrays(list: readonly SceneTray[]) {
      clearTrays();
      list.forEach(({ spec, mesh }, i) => {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
        geometry.setIndex(new BufferAttribute(mesh.indices, 1));
        geometry.computeVertexNormals();
        const c = trayColor(i);
        const material = new MeshStandardMaterial({
          color: new Color().setHSL(c.h, c.s, c.l),
          flatShading: true,
          roughness: 0.8,
        });
        const object = new ThreeMesh(geometry, material);
        scene.add(object);
        trays.push({ spec, object, material });
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
      controls.removeEventListener("change", requestDraw);
      controls.dispose();
      clearTrays();
      clearOutline();
      renderer.dispose();
      pick = null;
    },
  };
  return handle;
};
