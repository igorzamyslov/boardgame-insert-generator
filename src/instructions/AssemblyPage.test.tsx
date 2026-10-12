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
});
