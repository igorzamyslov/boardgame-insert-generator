// src/viewer/Viewer.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { MeshSource } from "../app/meshes";
import { trayNames } from "../instructions/naming";
import { buildSpecOf, numberParts, partsByKey } from "../instructions/numbering";
import type { Box, Component, Settings, TraySpec } from "../model/types";
import { levelsOf } from "../plan/layers";
import { SelectField } from "../ui/fields";
import { tintOfTray } from "../ui/identity";
import type { ColorScheme } from "../ui/identity";
import { AxisGizmo } from "./AxisGizmo";
import type { ViewBasis } from "./axes";
import { pageScheme, shadeColorOf } from "./shades";
import { boxOutline } from "./transform";
import type { SceneFactory, SceneHandle, SceneTray } from "./types";
import { WebGLUnavailableError, hasWebGL } from "./webgl";

export interface ViewerProps {
  trays: readonly TraySpec[];
  box: Box;
  settings: Settings;
  /** The components the trays hold: each tray takes the tint of its component, as in the plan. */
  components?: readonly Component[];
  /** The inputs no longer match the layout: keep what was built rather than build for new settings. */
  stale?: boolean;
  meshes: MeshSource;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  webgl?: () => boolean;
  loadScene?: () => Promise<SceneFactory>;
}

type Status = "loading" | "ready" | "nowebgl" | "error" | "lost";

/** The page's colour scheme, kept current: the scene is repainted when it changes. */
function usePageScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(pageScheme);
  useEffect(() => {
    const update = (): void => setScheme(pageScheme());
    const query =
      typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
    // Older browsers only have the deprecated addListener on a MediaQueryList.
    if (query?.addEventListener) {
      query.addEventListener("change", update);
    } else {
      query?.addListener?.(update);
    }
    // The page's theme toggle sets data-theme on the root; the system query alone wouldn't see it.
    const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(update);
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    update();
    return () => {
      if (query?.removeEventListener) {
        query.removeEventListener("change", update);
      } else {
        query?.removeListener?.(update);
      }
      observer?.disconnect();
    };
  }, []);
  return scheme;
}

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
  // The axis indicator is off until asked for: most people never need it.
  const [showAxes, setShowAxes] = useState(false);
  const [maxLevel, setMaxLevel] = useState<number | null>(null);
  const [build, setBuild] = useState({ done: 0, total: 0, failed: 0 });
  const [attempt, setAttempt] = useState(0);
  // A lost or broken WebGL canvas can't be reused: a new scene gets a new canvas element.
  const [canvasKey, setCanvasKey] = useState(0);
  const scheme = usePageScheme();
  const levels = useMemo(() => levelsOf(p.trays), [p.trays]);
  const parts = useMemo(() => numberParts(p.trays), [p.trays]);
  const byKey = useMemo(() => partsByKey(parts), [parts]);
  const names = useMemo(() => trayNames(parts, p.components ?? []), [parts, p.components]);
  // The chosen layer may vanish when the layout changes: show everything then.
  const shownLevel = maxLevel !== null && levels.includes(maxLevel) ? maxLevel : null;

  const watchView = useCallback((cb: (view: ViewBasis) => void) => {
    handleRef.current?.onView(cb);
    return () => handleRef.current?.onView(null);
  }, []);

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
          const part = byKey.get(spec.key);
          const asked = part
            ? buildSpecOf(part, p.settings.engraveNames, names.get(spec.key)?.short)
            : spec;
          const built = await p.meshes.get(asked, p.settings, controller.signal);
          results[i] = {
            spec,
            mesh: built.mesh,
            color: shadeColorOf(spec, p.components ?? [], scheme),
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
  }, [status, p.trays, p.settings, p.stale, p.meshes, p.components, scheme, byKey, names, attempt]);

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
  const selected = p.selectedKey === null ? undefined : byKey.get(p.selectedKey);
  const selectedName = selected ? (names.get(selected.spec.key)?.full ?? selected.label) : null;
  return (
    <div class="viewer">
      <div class="viewer-stage">
        <canvas
          key={canvasKey}
          ref={canvasRef}
          class="viewer-canvas"
          aria-label="3D preview. Drag to turn, scroll or pinch to zoom, click a tray for details. On a touch screen use two fingers; one finger scrolls the page."
        />
        {showAxes && status === "ready" ? <AxisGizmo watch={watchView} /> : null}
        {/* Always mounted, so a reader that watches it hears the name appear. */}
        <div class="viewer-selection-live" role="status">
          {selectedName !== null ? (
            <span class="viewer-selection" title={selectedName}>
              {selectedName}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          class="viewer-axes-toggle"
          aria-pressed={showAxes}
          aria-label="Show axes"
          aria-describedby="viewer-axes-hint"
          title="Show axes"
          onClick={() => setShowAxes((v) => !v)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M5 19V4M5 19h15M5 19l8-8" />
          </svg>
        </button>
        <span id="viewer-axes-hint" class="visually-hidden">
          A small X, Y, Z indicator in the corner that turns with the model: X runs across the box,
          Y from its front to its back, Z up.
        </span>
      </div>
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
          Inputs changed: the preview shows the last layout. Update the plan to fix it.
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
        {levels.length > 1 ? (
          <SelectField
            id="viewer-layers"
            label="Show layers"
            value={shownLevel === null ? "all" : String(shownLevel)}
            options={[
              { value: "all", label: "All layers" },
              ...levels.map((l, i) => ({
                value: String(l),
                label: i === 0 ? "Layer 1 only" : `Layers 1 to ${i + 1}`,
              })),
            ]}
            onChange={(v) => setMaxLevel(v === "all" ? null : Number(v))}
          />
        ) : null}
      </div>
      {pickable.length > 0 ? (
        <ul class="tray-picker" aria-label="Trays">
          {pickable.map((part) => {
            const key = part.spec.key;
            const isSelected = key === p.selectedKey;
            const tint = tintOfTray(part.spec, p.components ?? []);
            return (
              <li key={key}>
                <button
                  type="button"
                  data-key={key}
                  aria-pressed={isSelected}
                  aria-label={names.get(key)?.full ?? part.label}
                  onClick={() => p.onSelect(isSelected ? null : key)}
                >
                  <span
                    class={tint === null ? "tray-chip tray-chip--spare" : "tray-chip"}
                    style={tint === null ? undefined : { "--tint": tint }}
                    aria-hidden="true"
                  />
                  {names.get(key)?.full ?? part.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
