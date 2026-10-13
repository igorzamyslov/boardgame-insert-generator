// src/instructions/AssemblyPage.tsx
import { useMemo, useRef, useState } from "preact/hooks";
import { downloadBlob, fileSlug } from "../app/download";
import type { Project, StoredLayout } from "../model/types";
import { errorText } from "../util/errors";
import { svgDataUrl, svgToPng } from "./png";
import { packingSteps, render, whatGoesWhere } from "./render";

export interface AssemblyPageProps {
  project: Project;
  layout: StoredLayout;
  /** The inputs no longer match the layout: the page would show sizes of other settings. */
  stale?: boolean;
  onBack: () => void;
  print?: () => void;
  toPng?: (svg: string, widthPx: number) => Promise<Blob>;
  download?: (blob: Blob, filename: string) => void;
}

const PNG_WIDTH_PX = 1600;

export function AssemblyPage(p: AssemblyPageProps) {
  const svgs = useMemo(() => render(p.layout, p.project), [p.layout, p.project]);
  const steps = useMemo(() => packingSteps(p.layout), [p.layout]);
  const rows = useMemo(
    () => whatGoesWhere(p.layout, p.project.settings),
    [p.layout, p.project.settings],
  );
  const [pngError, setPngError] = useState<string | null>(null);
  // One PNG at a time: the ref stops a double click before the state has re-rendered.
  const making = useRef(false);
  const [busy, setBusy] = useState(false);
  const slug = fileSlug(p.project.name);
  const { box } = p.project;

  async function savePng(svg: string, layer: number): Promise<void> {
    if (making.current) {
      return;
    }
    making.current = true;
    setBusy(true);
    setPngError(null);
    try {
      const blob = await (p.toPng ?? svgToPng)(svg, PNG_WIDTH_PX);
      (p.download ?? downloadBlob)(blob, `${slug}-layer-${layer}.png`);
    } catch (e) {
      setPngError(`Couldn't make the PNG: ${errorText(e)}`);
    } finally {
      making.current = false;
      setBusy(false);
    }
  }

  return (
    <article class="assembly" aria-labelledby="assembly-title">
      <div class="assembly-toolbar no-print">
        <button type="button" onClick={p.onBack}>
          Back to the editor
        </button>
        <button
          type="button"
          disabled={p.stale}
          onClick={() => (p.print ?? (() => window.print()))()}
        >
          Print / save as PDF
        </button>
      </div>
      <h1 id="assembly-title" tabIndex={-1}>{`${p.project.name} — assembly`}</h1>
      <p class="hint">
        {`Box ${box.innerWidth} × ${box.innerDepth} × ${box.innerHeight} mm. Layers are drawn from above with the box front at the bottom; numbers match the exported files.`}
      </p>
      {p.stale ? (
        <p class="hint" role="status">
          Inputs changed — update the plan before printing or saving this page. Go back to the
          editor to do that.
        </p>
      ) : null}
      {pngError !== null ? (
        <p class="run-error no-print" role="alert">
          {pngError}
        </p>
      ) : null}
      {svgs.length === 0 ? (
        <p class="hint" role="note">
          This layout has no trays yet, so there is nothing to assemble. Go back and add components,
          then let the layout run.
        </p>
      ) : (
        <>
          <section aria-labelledby="packing-title">
            <h2 id="packing-title">Packing order (bottom first)</h2>
            <ol>
              {steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </section>
          {svgs.map((svg, i) => {
            const layer = i + 1;
            const title = `Layer ${layer}${i === 0 ? " (bottom)" : ""}`;
            return (
              <section class="assembly-layer" key={i} aria-labelledby={`layer-title-${layer}`}>
                <h2 id={`layer-title-${layer}`}>{title}</h2>
                <img
                  class="assembly-svg"
                  src={svgDataUrl(svg)}
                  alt={`${title}: numbered trays seen from above`}
                />
                <button
                  type="button"
                  class="no-print"
                  disabled={busy || p.stale}
                  onClick={() => {
                    void savePng(svg, layer);
                  }}
                >
                  {`Download PNG of layer ${layer}`}
                </button>
              </section>
            );
          })}
          <section aria-labelledby="parts-title">
            <h2 id="parts-title">What goes where</h2>
            <table class="parts-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Part</th>
                  <th scope="col">Size</th>
                  <th scope="col">Layer</th>
                  <th scope="col">Holds</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.number}>
                    <td>{r.number}</td>
                    <td>{r.label}</td>
                    <td>{r.size}</td>
                    <td>{r.layer}</td>
                    <td>
                      {r.goesInto !== null
                        ? `Goes into tray #${r.goesInto}`
                        : r.contents.length > 0
                          ? r.contents.join(", ")
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </article>
  );
}
