// src/instructions/AssemblyPage.tsx
import { useMemo, useRef, useState } from "preact/hooks";
import { downloadBlob, fileSlug } from "../app/download";
import { Button } from "../kit";
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
  const engraving = p.project.settings.engraveNames;

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
        <Button variant="secondary" onClick={p.onBack}>
          Back to your insert
        </Button>
        <Button
          variant="primary"
          aria-disabled={p.stale ? "true" : undefined}
          onClick={() => {
            if (!p.stale) {
              (p.print ?? (() => window.print()))();
            }
          }}
        >
          Print or save as PDF
        </Button>
      </div>
      <h1 id="assembly-title" tabIndex={-1}>{`${p.project.name} — packing guide`}</h1>
      <p class="assembly-meta">
        {`Box ${box.innerWidth} × ${box.innerDepth} × ${box.innerHeight} mm. Layers are drawn from above, with the front of the box at the bottom.`}
      </p>
      {/* always mounted, so the reader is told when the plan goes out of date while the guide is open */}
      <div role="status" class="no-print">
        {p.stale ? (
          <p class="assembly-stale">
            The plan is out of date. Go back to your insert to update it.
          </p>
        ) : null}
      </div>
      {pngError !== null ? (
        <p class="assembly-error no-print" role="alert">
          {pngError}
        </p>
      ) : null}
      {svgs.length === 0 ? (
        <p class="hint" role="note">
          There are no trays yet, so nothing to pack. Go back and add what goes inside.
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
              <img
                class="assembly-svg"
                src={svgDataUrl(exploded.svg)}
                alt={`Exploded view of the trays in assembly order: ${exploded.parts
                  .map((x) => x.name)
                  .join(", ")}`}
              />
              <Button
                variant="secondary"
                class="no-print"
                aria-disabled={busy || p.stale ? "true" : undefined}
                onClick={() => {
                  if (!busy && !p.stale) {
                    void savePng(exploded.svg, "exploded");
                  }
                }}
              >
                Download PNG of the exploded view
              </Button>
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
                  <Button
                    variant="secondary"
                    class="no-print"
                    aria-disabled={busy || p.stale ? "true" : undefined}
                    onClick={() => {
                      if (!busy && !p.stale) {
                        void savePng(svg, `layer-${layer}`);
                      }
                    }}
                  >
                    {`Download PNG of layer ${layer}`}
                  </Button>
                </section>
              );
            })}
          </div>
          <section aria-labelledby="parts-title">
            <h2 id="parts-title">What goes where</h2>
            <table class="parts-table" role="table">
              <caption class="visually-hidden">Which tray goes where</caption>
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" scope="col">
                    Name
                  </th>
                  {engraving ? (
                    <th role="columnheader" scope="col">
                      Engraved as
                    </th>
                  ) : null}
                  <th role="columnheader" scope="col">
                    Size
                  </th>
                  <th role="columnheader" scope="col">
                    Position
                  </th>
                  <th role="columnheader" scope="col">
                    Layer
                  </th>
                  <th role="columnheader" scope="col">
                    Holds
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {rows.map((r) => (
                  <tr key={r.key} role="row">
                    <th role="rowheader" scope="row">
                      {r.name}
                    </th>
                    {engraving ? (
                      <td role="cell" data-label="Engraved as">
                        {r.engraved ?? (r.tooSmall ? "Too small for its name" : "—")}
                      </td>
                    ) : null}
                    <td role="cell" data-label="Size">
                      {r.size}
                    </td>
                    <td role="cell" data-label="Position">
                      {r.position}
                    </td>
                    <td role="cell" data-label="Layer">
                      {layers[r.layer - 1]?.title ?? `Layer ${r.layer}`}
                    </td>
                    <td role="cell" data-label="Holds">
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
