// src/viewer/Viewer.tsx
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { MeshSource } from "../app/meshes";
import { numberParts, partsByKey } from "../instructions/numbering";
import type { Box, Settings, TraySpec } from "../model/types";
import { levelsOf } from "../plan/layers";
import { SelectField } from "../ui/fields";
import { TrayDetails } from "../ui/TrayDetails";
import { boxOutline } from "./transform";
import type { SceneFactory, SceneHandle, SceneTray } from "./types";
import { WebGLUnavailableError, hasWebGL } from "./webgl";

export interface ViewerProps {
  trays: readonly TraySpec[];
  box: Box;
  settings: Settings;
  /** The inputs no longer match the layout: keep what was built rather than build for new settings. */
  stale?: boolean;
  meshes: MeshSource;
  selectedKey: string | null;
  lockedKeys: ReadonlySet<string>;
  /** trayKeys with a size lock; with `onToggleSizeLock` the details offer "Lock size". */
  sizeLockedKeys?: ReadonlySet<string>;
  onToggleSizeLock?: (key: string) => void;
  onSelect: (key: string | null) => void;
  /** Show the selected tray's details under the view; off where another panel shows them. */
  details?: boolean;
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
  const [maxLevel, setMaxLevel] = useState<number | null>(null);
  const [build, setBuild] = useState({ done: 0, total: 0, failed: 0 });
  const [attempt, setAttempt] = useState(0);
  // A lost or broken WebGL canvas can't be reused: a new scene gets a new canvas element.
  const [canvasKey, setCanvasKey] = useState(0);
  const levels = useMemo(() => levelsOf(p.trays), [p.trays]);
  const byKey = useMemo(() => partsByKey(numberParts(p.trays)), [p.trays]);
  // The chosen layer may vanish when the layout changes: show everything then.
  const shownLevel = maxLevel !== null && levels.includes(maxLevel) ? maxLevel : null;

  function dropScene(): void {
    handleRef.current?.dispose();
    handleRef.current = null;
  }

  function retryScene(): void {
    dropScene();
    setCanvasKey((k) => k + 1);
    setStatus("loading");
  }

  useEffect(
    () => () => {
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
    }
  }, [status, outlineKey]);

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
    if (maxLevel !== null && shownLevel === null) {
      setMaxLevel(null);
    }
  }, [maxLevel, shownLevel]);

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
          const built = await p.meshes.get(spec, p.settings, controller.signal);
          results[i] = { spec, mesh: built.mesh };
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
  }, [status, p.trays, p.settings, p.stale, p.meshes, attempt]);

  useEffect(() => {
    handleRef.current?.setExplode(explode);
  }, [status, explode]);

  useEffect(() => {
    handleRef.current?.setMaxLevel(shownLevel);
  }, [status, shownLevel]);

  useEffect(() => {
    handleRef.current?.setSelected(p.selectedKey);
  }, [status, p.selectedKey]);

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
        The 3D preview needs WebGL, which isn't available in this browser. The plan view, export and
        assembly page still work.
      </p>
    );
  }

  const selected = p.selectedKey === null ? undefined : byKey.get(p.selectedKey);
  return (
    <div class="viewer">
      <canvas
        key={canvasKey}
        ref={canvasRef}
        class="viewer-canvas"
        aria-label="3D preview. Drag to turn, scroll or pinch to zoom, click a tray for details. On a touch screen use two fingers; one finger scrolls the page."
      />
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
        <p class="hint">
          Inputs changed: the preview shows the last layout. Re-optimize to update it.
        </p>
      ) : null}
      {!p.stale && build.total > 0 && build.done < build.total ? (
        <div class="run-status" role="status">
          <progress value={build.done} max={build.total} aria-label="Building 3D models" />
          <span>{`Building 3D models ${build.done}/${build.total}…`}</span>
        </div>
      ) : null}
      {build.failed > 0 && build.done === build.total ? (
        <p role="alert">
          {`${build.failed} part(s) couldn't be shown. `}
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
      <div class="viewer-controls">
        <label class="range-field">
          Explode
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={explode}
            onInput={(e) => setExplode(Number(e.currentTarget.value))}
          />
        </label>
        {levels.length > 1 ? (
          <SelectField
            id="viewer-layers"
            label="Show layers"
            value={shownLevel === null ? "all" : String(shownLevel)}
            options={[
              { value: "all", label: "All layers" },
              ...levels.map((l, i) => ({
                value: String(l),
                label: i === 0 ? "Bottom layer only" : `Up to layer ${i + 1}`,
              })),
            ]}
            onChange={(v) => setMaxLevel(v === "all" ? null : Number(v))}
          />
        ) : null}
      </div>
      {selected && p.details !== false ? (
        <TrayDetails
          part={selected}
          settings={p.settings}
          locked={p.lockedKeys.has(selected.spec.key)}
          sizeLocked={p.sizeLockedKeys?.has(selected.spec.key) ?? false}
          stale={p.stale}
          onToggleSizeLock={
            p.onToggleSizeLock ? () => p.onToggleSizeLock?.(selected.spec.key) : undefined
          }
        />
      ) : null}
    </div>
  );
}
