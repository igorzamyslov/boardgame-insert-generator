// src/instructions/AssemblyPage.tsx
import { useMemo, useRef, useState } from "preact/hooks";
import { downloadBlob, fileSlug } from "../app/download";
import type { Project, StoredLayout } from "../model/types";
import { errorText } from "../util/errors";
import { explodedView } from "./exploded";
import { svgDataUrl, svgToPng } from "./png";
import "./assembly.css";
import { layerInfo, packingSteps, render, whatGoesWhere } from "./render";

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
  const exploded = useMemo(() => explodedView(p.layout, p.project), [p.layout, p.project]);
  const steps = useMemo(
    () => packingSteps(p.layout, p.project.components),
    [p.layout, p.project.components],
  );
  const layers = useMemo(
    () => layerInfo(p.layout, p.project.components),
    [p.layout, p.project.components],
  );
  const rows = useMemo(() => whatGoesWhere(p.layout, p.project), [p.layout, p.project]);
  const [pngError, setPngError] = useState<string | null>(null);
  // One PNG at a time: the ref stops a double click before the state has re-rendered.
  const making = useRef(false);
  const [busy, setBusy] = useState(false);
  const slug = fileSlug(p.project.name);
  const { box } = p.project;

  async function savePng(svg: string, name: string): Promise<void> {
    if (making.current) {
      return;
    }
    making.current = true;
    setBusy(true);
    setPngError(null);
    try {
      const blob = await (p.toPng ?? svgToPng)(svg, PNG_WIDTH_PX);
      (p.download ?? downloadBlob)(blob, `${slug}-${name}.png`);
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
        {`Box ${box.innerWidth} × ${box.innerDepth} × ${box.innerHeight} mm. Layers are drawn from above with the box front at the bottom; names match the ones engraved on the trays and in the exported files.`}
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
          {exploded !== null ? (
            <section class="assembly-exploded" aria-labelledby="exploded-title">
              <h2 id="exploded-title">How it goes together</h2>
              <p class="hint">
                Every part pulled apart, bottom first, with the names of the list above and the
                table below. Parts are drawn as plain blocks: the real trays are open on top.
              </p>
              <img
                class="assembly-svg"
                src={svgDataUrl(exploded.svg)}
                alt={`Exploded view of the parts in assembly order: ${exploded.parts
                  .map((x) => x.name)
                  .join(", ")}`}
              />
              <button
                type="button"
                class="no-print"
                disabled={busy || p.stale}
                onClick={() => {
                  void savePng(exploded.svg, "exploded");
                }}
              >
                Download PNG of the exploded view
              </button>
            </section>
          ) : null}
          <div class="assembly-layers">
            {svgs.map((svg, i) => {
              const layer = i + 1;
              const info = layers[i];
              const title = info?.title ?? `Layer ${layer}`;
              const trays = info?.trays ?? [];
              const alt =
                trays.length > 0
                  ? `${title}: ${trays.length === 1 ? "tray" : "trays"} ${trays.join(", ")}`
                  : `${title}: named trays seen from above`;
              return (
                <section class="assembly-layer" key={i} aria-labelledby={`layer-title-${layer}`}>
                  <h2 id={`layer-title-${layer}`}>{title}</h2>
                  <img class="assembly-svg" src={svgDataUrl(svg)} alt={alt} />
                  <button
                    type="button"
                    class="no-print"
                    disabled={busy || p.stale}
                    onClick={() => {
                      void savePng(svg, `layer-${layer}`);
                    }}
                  >
                    {`Download PNG of layer ${layer}`}
                  </button>
                </section>
              );
            })}
          </div>
          <section aria-labelledby="parts-title">
            <h2 id="parts-title">What goes where</h2>
            <table class="parts-table">
              <caption class="visually-hidden">Which part goes where</caption>
              <thead>
                <tr>
                  <th scope="col">Part</th>
                  <th scope="col">Size</th>
                  <th scope="col">Position</th>
                  <th scope="col">Layer</th>
                  <th scope="col">Holds</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{r.name}</th>
                    <td>{r.size}</td>
                    <td>{r.position}</td>
                    <td>{r.layer}</td>
                    <td>
                      {r.goesInto !== null
                        ? `Goes into ${r.goesInto}`
                        : r.carries !== null
                          ? `Carries ${r.carries}`
                          : r.contents.length > 0
                            ? r.contents.join(", ")
                            : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.some((r) => r.size.includes("lip")) ? (
              <p class="hint">
                A lip is the raised edge on top of a tray that locates the tray stacked on it.
              </p>
            ) : null}
          </section>
        </>
      )}
    </article>
  );
}
