// src/viewer/Viewer.tsx
import { useEffect, useRef, useState } from "preact/hooks";
import type { MeshSource } from "../app/meshes";
import { numberParts, partsByKey } from "../instructions/numbering";
import type { Box, Settings, TraySpec } from "../model/types";
import { levelsOf } from "../plan/layers";
import { SelectField } from "../ui/fields";
import { TrayDetails } from "../ui/TrayDetails";
import { boxOutline } from "./transform";
import type { SceneFactory, SceneHandle, SceneTray } from "./types";
import { hasWebGL } from "./webgl";

export interface ViewerProps {
  trays: readonly TraySpec[];
  box: Box;
  settings: Settings;
  meshes: MeshSource;
  selectedKey: string | null;
  lockedKeys: ReadonlySet<string>;
  /** trayKeys with a size lock; with `onToggleSizeLock` the details offer "Lock size". */
  sizeLockedKeys?: ReadonlySet<string>;
  onToggleSizeLock?: (key: string) => void;
  onSelect: (key: string | null) => void;
  webgl?: () => boolean;
  loadScene?: () => Promise<SceneFactory>;
}

type Status = "loading" | "ready" | "nowebgl" | "error";

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
  const levels = levelsOf(p.trays);
  const byKey = partsByKey(numberParts(p.trays));

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
        } catch {
          setStatus("nowebgl");
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

  useEffect(() => {
    const h = handleRef.current;
    if (status === "ready" && h) {
      h.setBox(boxOutline(p.box, p.settings));
    }
  }, [status, p.box, p.settings]);

  useEffect(() => {
    const h = handleRef.current;
    if (status !== "ready" || !h) {
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
      if (!cancelled) {
        h.setTrays(results.filter((r): r is SceneTray => r !== null));
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [status, p.trays, p.settings, p.meshes, attempt]);

  useEffect(() => {
    handleRef.current?.setExplode(explode);
  }, [status, explode]);

  useEffect(() => {
    handleRef.current?.setMaxLevel(maxLevel);
  }, [status, maxLevel]);

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
        ref={canvasRef}
        class="viewer-canvas"
        aria-label="3D preview. Drag to turn, scroll or pinch to zoom, click a tray for details."
      />
      {status === "loading" ? <p class="hint">Loading the 3D preview…</p> : null}
      {status === "error" ? (
        <p role="alert">
          Couldn't load the 3D preview.{" "}
          <button type="button" onClick={() => setStatus("loading")}>
            Retry
          </button>
        </p>
      ) : null}
      {build.total > 0 && build.done < build.total ? (
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
            value={maxLevel === null ? "all" : String(maxLevel)}
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
      {selected ? (
        <TrayDetails
          part={selected}
          settings={p.settings}
          locked={p.lockedKeys.has(selected.spec.key)}
          sizeLocked={p.sizeLockedKeys?.has(selected.spec.key) ?? false}
          onToggleSizeLock={
            p.onToggleSizeLock ? () => p.onToggleSizeLock?.(selected.spec.key) : undefined
          }
        />
      ) : null}
    </div>
  );
}
