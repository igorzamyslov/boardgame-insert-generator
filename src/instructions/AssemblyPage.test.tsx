// src/instructions/AssemblyPage.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureProject, makeLayout, makeTray } from "../app/test-helpers";
import { AssemblyPage } from "./AssemblyPage";

afterEach(cleanup);

const layout = makeLayout("h", [
  makeTray({ key: "a:p0:0", stack: 0, level: 0 }),
  makeTray({ key: "b:p0:0", stack: 0, level: 1, z: 40 }),
]);

describe("AssemblyPage", () => {
  it("shows packing order, one picture per layer and the parts table", () => {
    const project = { ...fixtureProject(), name: "Wing span" };
    render(<AssemblyPage project={project} layout={layout} onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Wing span — assembly");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toContain(
      "Layer 1: place #1 Deck A ×40.",
    );
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images[0]?.getAttribute("alt")).toMatch(/Layer 1 \(bottom\)/);
    expect(images[0]?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("names the layers, marking the top one, and lists the trays in each picture's alt text", () => {
    render(<AssemblyPage project={fixtureProject()} layout={layout} onBack={vi.fn()} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Packing order (bottom first)",
      "Layer 1 (bottom)",
      "Layer 2 (top)",
      "What goes where",
    ]);
    const images = screen.getAllByRole("img");
    expect(images[0]?.getAttribute("alt")).toBe("Layer 1 (bottom): tray 1 Deck A ×40");
    expect(images[1]?.getAttribute("alt")).toBe("Layer 2 (top): tray 2 Deck A ×40");
    expect(document.querySelector(".assembly-layers")?.children).toHaveLength(2);
  });

  it("has no (top) when there is one layer", () => {
    render(
      <AssemblyPage
        project={fixtureProject()}
        layout={makeLayout("h", [makeTray()])}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Layer 1 (bottom)" })).toBeTruthy();
    expect(screen.queryByText(/\(top\)/)).toBeNull();
  });

  it("makes the parts table readable: caption, row headers and a position column", () => {
    render(<AssemblyPage project={fixtureProject()} layout={layout} onBack={vi.fn()} />);
    const table = screen.getByRole("table", { name: "Which part goes where" });
    expect(table.querySelector("caption")?.className).toBe("visually-hidden");
    const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent);
    expect(heads).toEqual(["#", "Part", "Size", "Position", "Layer", "Holds"]);
    const rowHeads = [...table.querySelectorAll("tbody th")];
    expect(rowHeads.map((th) => [th.textContent, th.getAttribute("scope")])).toEqual([
      ["1", "row"],
      ["2", "row"],
    ]);
    expect(table.querySelector("tbody tr")?.textContent).toContain(
      "0 mm from the left, 0 mm from the front",
    );
  });

  it("for a stale layout says so and offers no PNG or print, but still goes back", () => {
    const print = vi.fn();
    const onBack = vi.fn();
    render(
      <AssemblyPage
        project={fixtureProject()}
        layout={layout}
        onBack={onBack}
        print={print}
        stale
      />,
    );
    expect(screen.getByText(/Inputs changed — update the plan before printing/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Print / save as PDF" }).hasAttribute("disabled"),
    ).toBe(true);
    for (const b of screen.getAllByRole("button", { name: /^Download PNG/ })) {
      expect(b.hasAttribute("disabled")).toBe(true);
    }
    fireEvent.click(screen.getByRole("button", { name: "Back to the editor" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows no stale hint for a current layout", () => {
    render(<AssemblyPage project={fixtureProject()} layout={layout} onBack={vi.fn()} />);
    expect(screen.queryByText(/Inputs changed/)).toBeNull();
  });

  it("prints and goes back", () => {
    const print = vi.fn();
    const onBack = vi.fn();
    render(
      <AssemblyPage project={fixtureProject()} layout={layout} onBack={onBack} print={print} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Print / save as PDF" }));
    expect(print).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to the editor" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("downloads a PNG per layer and reports failures", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const toPng = vi.fn(() => Promise.resolve(blob));
    const download = vi.fn();
    const project = { ...fixtureProject(), name: "Wing span" };
    const view = render(
      <AssemblyPage
        project={project}
        layout={layout}
        onBack={vi.fn()}
        toPng={toPng}
        download={download}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Download PNG of layer 2" }));
    await waitFor(() => expect(download).toHaveBeenCalledWith(blob, "Wing-span-layer-2.png"));
    view.unmount();
    render(
      <AssemblyPage
        project={project}
        layout={layout}
        onBack={vi.fn()}
        toPng={() => Promise.reject(new Error("canvas blocked"))}
        download={download}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Download PNG of layer 1" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/canvas blocked/));
  });

  it("disables the PNG buttons while one is being made, so one click downloads once", async () => {
    let finish: (b: Blob) => void = () => undefined;
    const toPng = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          finish = resolve;
        }),
    );
    const download = vi.fn();
    render(
      <AssemblyPage
        project={fixtureProject()}
        layout={layout}
        onBack={vi.fn()}
        toPng={toPng}
        download={download}
      />,
    );
    const first = screen.getByRole("button", { name: "Download PNG of layer 1" });
    fireEvent.click(first);
    fireEvent.click(first);
    fireEvent.click(screen.getByRole("button", { name: "Download PNG of layer 2" }));
    expect(toPng).toHaveBeenCalledTimes(1);
    expect((first as HTMLButtonElement).disabled).toBe(true);
    finish(new Blob(["png"]));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((first as HTMLButtonElement).disabled).toBe(false));
  });

  it("says so when the layout has no trays instead of showing empty sections", () => {
    render(
      <AssemblyPage project={fixtureProject()} layout={makeLayout("h", [])} onBack={vi.fn()} />,
    );
    expect(screen.getByRole("note").textContent).toMatch(/no trays/);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Back to the editor" })).toBeTruthy();
  });
});
