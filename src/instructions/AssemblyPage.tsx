// src/instructions/AssemblyPage.tsx
import { useMemo, useRef, useState } from "preact/hooks";
import { downloadBlob, fileSlug } from "../app/download";
import { Button } from "../kit";
import type { Project, StoredLayout } from "../model/types";
import { errorText } from "../util/errors";
import { explodedView } from "./exploded";
import { svgDataUrl, svgToPng } from "./png";
import "./assembly.css";
import { NO_GRIP_TAG, TAKE_OUT_HEADING, TAKE_OUT_NOTE, noGripNote } from "./lift";
import { packingGuide, render } from "./render";

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
  // One block per layer, bottom first: its parts in the order to put them in the box.
  const layers = useMemo(() => packingGuide(p.layout, p.project), [p.layout, p.project]);
  const [pngError, setPngError] = useState<string | null>(null);
  // One PNG at a time: the ref stops a double click before the state has re-rendered.
  const making = useRef(false);
  const [busy, setBusy] = useState(false);
  const slug = fileSlug(p.project.name);
  const { box } = p.project;
  const engraving = p.project.settings.engraveNames;
  // Named once above the layers, so the problem is seen before anything is printed.
  const gripless = layers.flatMap((l) => l.rows.filter((r) => r.noGrip).map((r) => r.name));

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
        {`Box ${box.innerWidth} × ${box.innerDepth} × ${box.innerHeight} mm. Pack from the bottom layer up. Layers are drawn from above, with the front of the box at the bottom.`}
      </p>
      {svgs.length > 0 ? (
        <div class="assembly-takeout">
          <p>
            <strong>{TAKE_OUT_HEADING}</strong> {TAKE_OUT_NOTE}
          </p>
          {gripless.length > 0 ? (
            <p class="assembly-takeout__flag" role="note">
              <strong>{`${NO_GRIP_TAG}:`}</strong> {noGripNote(gripless)}
            </p>
          ) : null}
        </div>
      ) : null}
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
          {layers.map((info, i) => {
            const layer = info.layer;
            const { title, trays } = info;
            const alt =
              trays.length > 0
                ? `${title}: ${trays.length === 1 ? "tray" : "trays"} ${trays.join(", ")}`
                : `${title}: named trays seen from above`;
            const svg = svgs[i] ?? "";
            return (
              <section class="assembly-layer" key={layer} aria-labelledby={`layer-title-${layer}`}>
                <h2 id={`layer-title-${layer}`}>{title}</h2>
                <div class="assembly-layer__body">
                  <div class="assembly-layer__picture">
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
                  </div>
                  <table class="parts-table" role="table">
                    <caption class="visually-hidden">
                      {`${title}, in the order to put them in`}
                    </caption>
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
                          Holds
                        </th>
                        <th role="columnheader" scope="col">
                          Lift
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {info.rows.map((r) => (
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
                          <td role="cell" data-label="Holds">
                            {r.goesInto !== null
                              ? `Goes into ${r.goesInto}`
                              : r.carries !== null
                                ? `Carries ${r.carries}`
                                : r.contents.length > 0
                                  ? r.contents.join(", ")
                                  : "—"}
                          </td>
                          <td role="cell" data-label="Lift" data-grip={r.grip}>
                            {/* one box, so the phone's card keeps the flag and the line together */}
                            <span>
                              {r.noGrip ? (
                                <>
                                  <strong class="assembly-flag">{NO_GRIP_TAG}</strong>{" "}
                                </>
                              ) : null}
                              {r.lift}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
          {(layers.at(-1)?.closing ?? []).length > 0 ? (
            <section class="assembly-closing" aria-labelledby="closing-title">
              <h2 id="closing-title">Last</h2>
              <ol>
                {(layers.at(-1)?.closing ?? []).map((c, i) => (
                  <li key={i}>{c.text}</li>
                ))}
              </ol>
            </section>
          ) : null}
          {layers.some((l) => l.rows.some((r) => r.size.includes("lip"))) ? (
            <p class="hint">
              A lip is the raised edge on top of a tray that locates the tray stacked on it.
            </p>
          ) : null}
          {layers.some((l) => l.rows.some((r) => r.size.includes("with its step"))) ? (
            <p class="hint">
              A step is the solid base under a tray that drops into the tray below it.
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}
