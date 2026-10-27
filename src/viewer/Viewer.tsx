// src/viewer/Viewer.tsx
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { MeshSource } from "../app/meshes";
import { STALE_MESSAGE } from "../app/state";
import { ProgressBar } from "../kit";
import { trayNames } from "../instructions/naming";
import { buildSpecOf, numberParts, partsByKey } from "../instructions/numbering";
import { slabUnder } from "../model/lip";
import type { Box, Component, Group, ReservedSpec, Settings, TraySpec } from "../model/types";
import { levelsOf } from "../plan/layers";
import { hoveredComponent, hoveredMembers } from "../screens/hover";
import { componentIdsOfTray, sharingTrayWith } from "../ui/identity";
import { pageScheme, shadeColorOf, wellColorsOf } from "./shades";
import { boxOutline, reservedSlabs } from "./transform";
import type { SceneFactory, SceneHandle, SceneTray } from "./types";
import { projectionPref, viewMemory } from "./view";
import { WebGLUnavailableError, hasWebGL } from "./webgl";

export interface ViewerProps {
  trays: readonly TraySpec[];
  box: Box;
  settings: Settings;
  /** The components the trays hold: each tray takes the tint of its component, as in the plan. */
  components?: readonly Component[];
  /** The project's groups: a group's trays are called by its name and drawn in its neutral colour. */
  groups?: readonly Group[];
  /**
   * The project the view shows: its camera (where it stands, the projection, the spread) is kept
   * for the visit under this id, so leaving 3D for the top view and coming back finds the same view.
   * Without it nothing is kept.
   */
  projectId?: string;
  /** The inputs no longer match the layout: keep what was built rather than build for new settings. */
  stale?: boolean;
  meshes: MeshSource;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  /**
   * The Layer switch's cut (StageTop, in 3D): the index of the highest layer shown, so layers 1
   * to it; null or none shows every layer. A layer the plan no longer has shows everything.
   */
  topLayer?: number | null;
  /**
   * The plan's layers (`levelsOf`), the one list the Layer switch is made from: `topLayer` is an
   * index into it. Without it the list is made from `trays`.
   */
  levels?: readonly number[];
  /**
   * Trays lit as the item or group being edited is (the rest fades), the way a rail row lights its
   * trays; the editor's stage gives them. They join the trays a rail row lights.
   */
  litKeys?: readonly string[];
  /**
   * The tray that does not fit (the no-fit stage): lit alone, as the edited item is, and in the
   * scene tinted in the warn colour and lifted out of its slot, the same marking the plan gives it.
   */
  misfitKey?: string | null;
  /** Escape on the canvas: it ends a swap that is chosen in this view. */
  onEscape?: () => void;
  /** The caption says what a click does ("tap a tray for details"): the normal stage, not the editor's. */
  tapHint?: boolean;
  /**
   * The areas kept free on top (`layout.reserved`): each drawn as a translucent slab at its place,
   * the paper's thickness (`box.headroom`) thick. Not a part: it is never picked or exported.
   */
  reserved?: readonly ReservedSpec[];
  webgl?: () => boolean;
  loadScene?: () => Promise<SceneFactory>;
}

type Status = "loading" | "ready" | "nowebgl" | "error" | "lost";

async function defaultLoadScene(): Promise<SceneFactory> {
  const mod = await import("./scene");
  return mod.createScene;
}

export function Viewer(p: ViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const onSelectRef = useRef(p.onSelect);
  onSelectRef.current = p.onSelect;
  const [status, setStatus] = useState<Status>(() =>
    (p.webgl ?? hasWebGL)() ? "loading" : "nowebgl",
  );
  const [explode, setExplode] = useState(0);
  // The projection is this browser's choice (Settings); a restored view brings its own along.
  const projection = projectionPref.value;
  // The project the camera was last put back for on the scene now (a new scene starts again).
  const restoredFor = useRef<string | undefined | null>(null);
  const [build, setBuild] = useState({ done: 0, total: 0, failed: 0 });
  const [attempt, setAttempt] = useState(0);
  // A lost or broken WebGL canvas can't be reused: a new scene gets a new canvas element.
  const [canvasKey, setCanvasKey] = useState(0);
  const scheme = pageScheme();
  const misfitKey = p.misfitKey ?? null;
  const ownLevels = useMemo(() => levelsOf(p.trays), [p.trays]);
  const levels = p.levels ?? ownLevels;
  const parts = useMemo(() => numberParts(p.trays), [p.trays]);
  const byKey = useMemo(() => partsByKey(parts), [parts]);
  const names = useMemo(
    () => trayNames(parts, p.components ?? [], p.groups ?? []),
    [parts, p.components, p.groups],
  );
  // The chosen layer may vanish when the layout changes: show everything then.
  const shownLevel =
    p.topLayer === null || p.topLayer === undefined ? null : (levels[p.topLayer] ?? null);

  function dropScene(): void {
    handleRef.current?.dispose();
    handleRef.current = null;
  }

  function retryScene(): void {
    dropScene();
    setCanvasKey((k) => k + 1);
    setStatus("loading");
  }

  // The page the camera is kept for, as the view goes: the cleanup below reads it when the viewer is unmounted.
  const projectIdRef = useRef(p.projectId);
  projectIdRef.current = p.projectId;
  useEffect(
    () => () => {
      // The camera is read before the scene goes: this cleanup runs ahead of the one that keeps the view
      // (effects clean up in the order they are written), so a viewer unmounted by the switch to Top
      // would otherwise keep nothing and open at its first framing again.
      const view = handleRef.current?.getView?.();
      if (view !== undefined) {
        viewMemory.set(projectIdRef.current, view);
      }
      handleRef.current?.dispose();
      handleRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (status !== "loading") {
      return undefined;
    }
    let cancelled = false;
    restoredFor.current = null;
    (p.loadScene ?? defaultLoadScene)().then(
      (factory) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) {
          return;
        }
        try {
          const handle = factory(canvas);
          handle.onPick((key) => onSelectRef.current(key));
          handleRef.current = handle;
          setStatus("ready");
        } catch (e) {
          setStatus(e instanceof WebGLUnavailableError ? "nowebgl" : "error");
        }
      },
      () => {
        if (!cancelled) {
          setStatus("error");
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [status]);

  // The outline (and with it the camera fit) follows the box, not every settings change.
  const outline = boxOutline(p.box, p.settings);
  const outlineKey = [...outline.min, ...outline.size].join(",");
  useEffect(() => {
    const h = handleRef.current;
    if (status === "ready" && h) {
      h.setBox(outline);
      // The first box this scene frames for a project: its remembered camera goes back, if the box is
      // about the size it was (the scene says); a later change of box is the scene's to frame.
      if (restoredFor.current !== p.projectId) {
        restoredFor.current = p.projectId;
        const saved = viewMemory.get(p.projectId);
        // the camera comes back; the projection is the browser's choice as it is now
        if (
          saved !== undefined &&
          h.setView?.({ ...saved, projection: projectionPref.peek() }) === true
        ) {
          setExplode(saved.explode);
        }
      }
    }
  }, [status, outlineKey, p.projectId]);

  // The camera is kept as the view goes (to the top view, to another project, off the page).
  useEffect(() => {
    const h = handleRef.current;
    if (status !== "ready" || !h) {
      return undefined;
    }
    const projectId = p.projectId;
    return () => {
      const view = h.getView?.();
      if (view !== undefined) {
        viewMemory.set(projectId, view);
      }
    };
  }, [status, p.projectId]);

  useEffect(() => {
    handleRef.current?.setProjection?.(projection);
  }, [status, projection]);

  useEffect(() => {
    handleRef.current?.setScheme?.(scheme);
  }, [status, scheme]);

  // A string key, so the scene hears of a change and not of every render.
  const slabs = reservedSlabs(p.reserved, p.box);
  const slabsKey = JSON.stringify(slabs);
  useEffect(() => {
    if (status === "ready") {
      handleRef.current?.setReserved?.(slabs);
    }
  }, [status, slabsKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (status !== "ready" || !canvas) {
      return undefined;
    }
    const onLost = (): void => {
      dropScene();
      setStatus("lost");
    };
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [status]);

  useEffect(() => {
    const h = handleRef.current;
    // While stale the scene keeps the meshes it has (settings that don't match the layout
    // would build trays that never were in it); the effect runs again when the layout is current.
    if (status !== "ready" || !h || p.stale) {
      return undefined;
    }
    let cancelled = false;
    // Builds this effect no longer needs are aborted (roadmap §4.3): the worker skips them.
    const controller = new AbortController();
    const list = p.trays;
    const results: (SceneTray | null)[] = list.map(() => null);
    let done = 0;
    let failed = 0;
    setBuild({ done: 0, total: list.length, failed: 0 });
    void Promise.all(
      list.map(async (spec, i) => {
        try {
          const part = byKey.get(spec.key);
          const asked = part
            ? buildSpecOf(part, p.settings.engraveNames, names.get(spec.key)?.short)
            : spec;
          const built = await p.meshes.get(asked, p.settings, controller.signal);
          results[i] = {
            spec,
            mesh: built.mesh,
            color: shadeColorOf(spec, p.components ?? [], scheme, p.groups ?? []),
            wells: wellColorsOf(spec, p.components ?? [], scheme, p.groups ?? []),
            below: slabUnder(p.settings, spec),
          };
        } catch {
          failed += 1;
        }
        done += 1;
        if (!cancelled) {
          setBuild({ done, total: list.length, failed });
        }
      }),
    ).then(() => {
      if (cancelled) {
        return;
      }
      try {
        h.setTrays(results.filter((r): r is SceneTray => r !== null));
      } catch {
        dropScene();
        setStatus("error");
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // p.components and the colour scheme are dependencies because they decide each tray's colour:
    // without them, editing the components (which can leave the layout alone) or switching the
    // page to dark left the scene on its old colours while the list, plan and chips moved on.
  }, [
    status,
    p.trays,
    p.settings,
    p.stale,
    p.meshes,
    p.components,
    p.groups,
    scheme,
    byKey,
    names,
    attempt,
  ]);

  useEffect(() => {
    handleRef.current?.setExplode(explode);
  }, [status, explode]);

  useEffect(() => {
    handleRef.current?.setMaxLevel(shownLevel);
  }, [status, shownLevel]);

  useEffect(() => {
    handleRef.current?.setMisfit(misfitKey);
  }, [status, misfitKey, p.trays]);

  useEffect(() => {
    handleRef.current?.setSelected(p.selectedKey);
  }, [status, p.selectedKey]);

  // The rail row the pointer or focus is on lights its component's trays, as it does in the top
  // view. A string key, so the scene hears of a change and not of every render.
  const railId = hoveredComponent.value;
  // A group's card pointed at names every member: all the group's trays light.
  const railMembers = hoveredMembers.value;
  const editedKey = (misfitKey === null ? (p.litKeys ?? []) : [misfitKey]).join("\n");
  // An item is being edited (the editor gave its trays): they are lit hard, not as a hover is.
  const editing = editedKey !== "";
  const litKey = useMemo(() => {
    const comps = p.components ?? [];
    const keys = editedKey === "" ? [] : editedKey.split("\n");
    if (railId === null && railMembers === null) {
      return keys.join("\n");
    }
    // The items that share a tray with the one pointed at light with it, as in the top view.
    const lit = new Set<string>();
    for (const id of [...(railId === null ? [] : [railId]), ...(railMembers ?? [])]) {
      sharingTrayWith(id, p.trays, comps).forEach((other) => lit.add(other));
    }
    const pointed = p.trays
      .filter((t) => componentIdsOfTray(t, comps).some((id) => lit.has(id)))
      .map((t) => t.key);
    return [...new Set([...keys, ...pointed])].join("\n");
  }, [railId, railMembers, p.trays, p.components, editedKey]);
  useEffect(() => {
    const keys = litKey === "" ? [] : litKey.split("\n");
    if (editing) {
      handleRef.current?.setLit(keys, true);
    } else {
      handleRef.current?.setLit(keys);
    }
  }, [status, litKey, editing]);

  useEffect(() => {
    const h = handleRef.current;
    const canvas = canvasRef.current;
    if (status !== "ready" || !h || !canvas) {
      return undefined;
    }
    const fit = (): void => h.resize(canvas.clientWidth, canvas.clientHeight);
    fit();
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [status]);

  if (status === "nowebgl") {
    return (
      <p class="viewer-fallback" role="note">
        3D needs WebGL turned on. The top view works the same.
      </p>
    );
  }

  const pickable = parts.filter(
    (part) =>
      part.spec.part !== "spacer" &&
      part.spec.part !== "divider" &&
      (shownLevel === null || part.spec.level <= shownLevel),
  );
  // The arrow keys step through the trays the scene shows, ends wrapping round: a keyboard route
  // to every tray, now that the scene has no row of chips for it.
  const stepTray = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && p.onEscape !== undefined) {
      p.onEscape();
      return;
    }
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    if (
      (!forward && e.key !== "ArrowLeft" && e.key !== "ArrowUp") ||
      e.altKey ||
      e.ctrlKey ||
      e.metaKey ||
      pickable.length === 0
    ) {
      return;
    }
    e.preventDefault();
    const at = pickable.findIndex((part) => part.spec.key === p.selectedKey);
    const next =
      at < 0
        ? forward
          ? 0
          : pickable.length - 1
        : (at + (forward ? 1 : -1) + pickable.length) % pickable.length;
    const key = pickable[next]?.spec.key;
    if (key !== undefined) {
      p.onSelect(key);
    }
  };
  const selected = p.selectedKey === null ? undefined : byKey.get(p.selectedKey);
  const selectedName = selected ? (names.get(selected.spec.key)?.full ?? selected.label) : null;
  return (
    <div class="viewer">
      <div
        class="plan-fit viewer-fit"
        style={{ "--box-w": String(p.box.innerWidth), "--box-l": String(p.box.innerDepth) }}
      >
        <div class="viewer-stage" data-region="plan-box">
          <canvas
            key={canvasKey}
            ref={canvasRef}
            class="viewer-canvas"
            tabIndex={0}
            aria-label="3D preview. Drag to turn, scroll or pinch to zoom, click a tray for details, or step through the trays with the arrow keys. On a touch screen use two fingers; one finger scrolls the page."
            onKeyDown={stepTray}
          />
          {/* Always mounted, so a reader that watches it hears the name appear. */}
          <div class="viewer-selection-live" role="status">
            {selectedName !== null ? (
              <span class="viewer-selection" title={selectedName}>
                {selectedName}
              </span>
            ) : null}
          </div>
          <div class="viewer-under">
            {status === "loading" ? <p class="hint">Loading the 3D preview…</p> : null}
            {status === "error" || status === "lost" ? (
              <p role="alert">
                {status === "lost"
                  ? "The 3D preview stopped because the graphics context was lost. "
                  : "Couldn't show the 3D preview. "}
                <button type="button" onClick={retryScene}>
                  Retry
                </button>
              </p>
            ) : null}
            {p.stale ? (
              <p class="hint">{`${STALE_MESSAGE} The preview shows the last plan.`}</p>
            ) : null}
            {/* always mounted, so the progress is spoken when it starts; the count stays on screen only */}
            <div class="visually-hidden" role="status">
              {!p.stale && build.total > 0 && build.done < build.total ? "Building 3D models." : ""}
            </div>
            {!p.stale && build.total > 0 && build.done < build.total ? (
              <div class="run-status viewer-build">
                <ProgressBar label="Building 3D models" value={(build.done / build.total) * 100} />
                <span class="viewer-build__caption">{`${build.done} of ${build.total} models built`}</span>
              </div>
            ) : null}
            {build.failed > 0 && build.done === build.total ? (
              <p role="alert">
                {`${build.failed === 1 ? "1 tray" : `${build.failed} trays`} couldn't be shown. `}
                <button
                  type="button"
                  onClick={() => {
                    p.meshes.reset();
                    setAttempt((a) => a + 1);
                  }}
                >
                  Retry
                </button>
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {/* The caption row under the frame, as the plan's: what the view does at its left, Spread apart (the one control only 3D has) at its right. */}
      <div class="plan-caption plan-caption--3d">
        <span>{p.tapHint === true ? "Drag to turn · tap a tray for details" : "Drag to turn"}</span>
        <div class="plan-caption__controls">
          <button type="button" class="view-reset" onClick={() => handleRef.current?.resetView?.()}>
            Reset view
          </button>
          <label class="range-field">
            Spread apart
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              aria-valuetext={explode === 0 ? "Together" : `${Math.round(explode * 100)}% apart`}
              value={explode}
              onInput={(e) => setExplode(Number(e.currentTarget.value))}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
