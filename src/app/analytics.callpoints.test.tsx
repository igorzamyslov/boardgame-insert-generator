// src/app/analytics.callpoints.test.tsx
// @vitest-environment jsdom
// The places that count: each fires once, with the event's name and nothing else.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import { DEFAULT_PRINTER } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import { toSerializable } from "../model/schema";
import { ExportPanel } from "../ui/ExportPanel";
import { count, countingOn } from "./analytics";
import {
  EMPTY_FOREIGN,
  cubeMesh,
  fixtureProject,
  flush,
  makeLayout,
  makeResult,
  makeTray,
} from "./test-helpers";
import { stubLayoutClient } from "./test-helpers";
import { createRunner } from "./runner";
import { createState } from "./state";
import { renderApp } from "./test-app";

vi.mock("./analytics", async (orig) => ({
  ...(await orig<typeof import("./analytics")>()),
  count: vi.fn(),
  countingOn: vi.fn(() => true),
}));

beforeEach(() => {
  vi.mocked(count).mockClear();
  vi.mocked(countingOn).mockReturnValue(true);
});
afterEach(cleanup);

function panel() {
  const meshes = {
    get: vi.fn(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 })),
    reset: vi.fn(),
    forget: vi.fn(),
    dispose: vi.fn(),
  };
  const download = vi.fn();
  render(
    <ExportPanel
      trays={[makeTray({ key: "a:p0:0", stack: 0 })]}
      printer={DEFAULT_PRINTER}
      settings={DEFAULT_SETTINGS}
      meshes={meshes}
      projectName="Wing span"
      disabled={false}
      download={download}
      onClose={vi.fn()}
    />,
  );
  return download;
}

describe("a download is counted by its format", () => {
  it.each([
    ["Download the 3MF file", "download-3mf", false],
    ["One 3MF per part (.zip)", "download-zip", true],
    ["STL files (.zip)", "download-stl", true],
  ] as const)("%s → %s", async (label, event, folded) => {
    const download = panel();
    if (folded) {
      fireEvent.click(screen.getByRole("button", { name: "Other formats" }));
    }
    expect(count).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith(event);
  });

  it("says plainly that it counts, with the privacy link, only while counting is on", () => {
    panel();
    const line = screen.getByText(/Counts visits and downloads anonymously, with no cookies\./);
    const link = line.querySelector("a");
    expect(link?.getAttribute("href")).toBe("./privacy.html");
    expect(link?.getAttribute("target")).toBe("_blank");
    cleanup();
    vi.mocked(countingOn).mockReturnValue(false);
    panel();
    expect(screen.queryByText(/Counts visits/)).toBeNull();
  });
});

describe("the first plan of a project is counted once", () => {
  function setup(withPlan: boolean) {
    const p = fixtureProject();
    const state = createState(withPlan ? { ...p, layout: makeLayout(inputsHash(p)) } : p);
    const stub = stubLayoutClient();
    const runner = createRunner(
      state,
      { loadLayoutClient: () => Promise.resolve(stub.client), confirm: () => true },
      { onAccepted: vi.fn() },
    );
    return { stub, runner };
  }
  async function finish(s: ReturnType<typeof setup>): Promise<void> {
    void s.runner.runNow("edit", "user");
    await flush();
    const call = s.stub.calls[0];
    call?.resolve(makeResult(makeLayout(call.input.inputsHash)));
    await flush();
  }

  it("counts a project that had no plan", async () => {
    await finish(setup(false));
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith("plan");
  });

  it("does not count a new plan for a project that already had one", async () => {
    await finish(setup(true));
    expect(count).not.toHaveBeenCalled();
  });
});

describe("the project file and the guide", () => {
  const withPlan = () => {
    const p = fixtureProject();
    return { ...p, layout: makeLayout(inputsHash(p), [makeTray({ key: "a:p0:0", stack: 0 })]) };
  };

  it("counts Save file once", () => {
    renderApp({ project: withPlan() });
    fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Save file" }));
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith("file-save");
  });

  it("counts an opened project file once, and not one that can't be read", async () => {
    renderApp({ project: withPlan() });
    const input = screen.getByLabelText("Open an insert file") as HTMLInputElement;
    const other = { ...fixtureProject(), id: "from-file", name: "From a file" };
    const text = JSON.stringify(toSerializable(other, EMPTY_FOREIGN));
    fireEvent.change(input, { target: { files: [new File(["not json"], "bad.json")] } });
    await waitFor(() => expect(count).toHaveBeenCalledTimes(1));
    expect(count).toHaveBeenCalledWith("file-open-failed");
    vi.mocked(count).mockClear();
    fireEvent.change(input, { target: { files: [new File([text], "a.insert.json")] } });
    await waitFor(() => expect(count).toHaveBeenCalledTimes(1));
    expect(count).toHaveBeenCalledWith("file-open");
  });

  it("counts the packing guide once", () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    renderApp({ project: withPlan() });
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    fireEvent.click(screen.getByRole("button", { name: /^Packing guide/ }));
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith("guide");
  });

  it("counts the 3D view and the settings once each", () => {
    renderApp({
      project: withPlan(),
      overrides: {
        viewerProps: { webgl: () => true, loadScene: () => new Promise<never>(() => undefined) },
      },
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "View" })).getByRole("button", { name: "3D" }),
    );
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith("view-3d");
    vi.mocked(count).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith("settings-open");
  });

  it("counts the example game once, and an added kind by its kind", () => {
    renderApp({ project: { ...fixtureProject(), components: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Start from an example game" }));
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith("start-example");
    vi.mocked(count).mockClear();
    cleanup();
    renderApp({ project: { ...fixtureProject(), components: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Tiles" }));
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith("add-tiles");
  });
});
