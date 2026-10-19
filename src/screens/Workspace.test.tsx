// @vitest-environment jsdom
// src/screens/Workspace.test.tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";

afterEach(cleanup);

const slots = {
  header: <h1>Insert Generator</h1>,
  rail: <p>The rail</p>,
  stage: <p>The stage</p>,
};

describe("Workspace", () => {
  it("has one banner, a rail named What's inside and one main", () => {
    render(<Workspace {...slots} />);
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    const rail = screen.getByRole("complementary", { name: "What's inside" });
    expect(within(rail).getByText("The rail")).toBeTruthy();
    const main = screen.getAllByRole("main");
    expect(main).toHaveLength(1);
    expect(within(main[0] as HTMLElement).getByText("The stage")).toBeTruthy();
    expect(within(screen.getByRole("banner")).getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("marks its regions for the screenshots", () => {
    const { container } = render(<Workspace {...slots} />);
    const regions = [...container.querySelectorAll("[data-region]")].map((el) => [
      el.getAttribute("data-region"),
      el.localName,
    ]);
    expect(regions).toEqual([
      ["header", "header"],
      ["rail", "aside"],
      ["stage", "main"],
    ]);
  });

  it("gives a focused screen the wider stage padding", () => {
    const { container, rerender } = render(<Workspace {...slots} />);
    expect(container.querySelector(".ws-stage--focus")).toBeNull();
    rerender(<Workspace {...slots} focus />);
    expect(container.querySelector('main[data-region="stage"].ws-stage--focus')).toBeTruthy();
  });

  it("takes a class for a screen that restyles its regions", () => {
    const { container } = render(<Workspace {...slots} class="fv" />);
    expect(container.firstElementChild?.className).toBe("ws fv");
  });

  it("makes the header and the stage inert behind a sheet that fills the screen", () => {
    const { container, rerender } = render(<Workspace {...slots} />);
    expect(container.querySelector("[inert]")).toBeNull();
    rerender(<Workspace {...slots} inert />);
    const behind = [...container.querySelectorAll("[inert]")].map((el) => el.localName);
    expect(behind).toEqual(["header", "main"]);
  });

  describe("with a sheet (a phone)", () => {
    const sheet = (expanded: boolean, onExpandedChange = vi.fn()) => ({
      label: "The box and what's inside",
      title: "What's inside",
      summary: "8 items",
      expanded,
      onExpandedChange,
    });

    it("holds the rail's content in the sheet, not in an aside", () => {
      const { container } = render(<Workspace {...slots} sheet={sheet(true)} />);
      expect(screen.queryByRole("complementary")).toBeNull();
      const region = screen.getByRole("region", { name: "The box and what's inside" });
      expect(region.getAttribute("data-region")).toBe("sheet");
      expect(within(region).getByText("The rail")).toBeTruthy();
      expect(within(region).getByText("8 items")).toBeTruthy();
      expect(container.querySelector('[data-region="rail"]')).toBeNull();
      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(container.querySelector(".ws--sheet")).toBeTruthy();
    });

    it("asks the owner to open and fold it", () => {
      const onExpandedChange = vi.fn();
      render(<Workspace {...slots} sheet={sheet(false, onExpandedChange)} />);
      fireEvent.click(screen.getByRole("button", { name: /What's inside/ }));
      expect(onExpandedChange).toHaveBeenCalledWith(true);
    });
  });
});

describe("Workspace: the rail's handle", () => {
  function setup(value = 300) {
    const onChange = vi.fn();
    const view = render(<Workspace {...slots} railWidth={{ value, onChange }} />);
    const handle = screen.getByRole("separator", { name: "Resize the list" });
    const shell = view.container.querySelector<HTMLElement>(".ws");
    return { onChange, handle, shell };
  }

  beforeEach(() => {
    // jsdom has no pointer capture
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });

  it("is a vertical separator with the width, its range and a place in the tab order", () => {
    const { handle } = setup(420);
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-valuenow")).toBe("420");
    expect(handle.getAttribute("aria-valuemin")).toBe("300");
    expect(handle.getAttribute("aria-valuemax")).toBe("480");
    expect(handle.tabIndex).toBe(0);
  });

  it("sets the rail's width on the shell, and has no handle without a width to set", () => {
    const { shell } = setup(360);
    expect(shell?.style.getPropertyValue("--rail-w")).toBe("360px");
    cleanup();
    const bare = render(<Workspace {...slots} />);
    expect(screen.queryByRole("separator")).toBeNull();
    expect(
      bare.container.querySelector<HTMLElement>(".ws")?.style.getPropertyValue("--rail-w"),
    ).toBe("");
  });

  it("sits between the rail and the stage", () => {
    const { handle } = setup();
    expect(handle.previousElementSibling?.getAttribute("data-region")).toBe("rail");
    expect(handle.nextElementSibling?.getAttribute("data-region")).toBe("stage");
  });

  it.each([
    ["ArrowRight", {}, 316],
    ["ArrowLeft", {}, 300],
    ["ArrowRight", { shiftKey: true }, 348],
    ["End", {}, 480],
    ["Home", {}, 300],
  ])("%s %j moves it to %i px", (key, mods, to) => {
    const { handle, onChange } = setup(key === "ArrowLeft" ? 316 : 300);
    fireEvent.keyDown(handle, { key, ...mods });
    expect(onChange).toHaveBeenCalledWith(to);
  });

  it("stops at 300 and 480 with the arrow keys", () => {
    const low = setup(300);
    fireEvent.keyDown(low.handle, { key: "ArrowLeft", shiftKey: true });
    expect(low.onChange).toHaveBeenCalledWith(300);
    cleanup();
    const high = setup(470);
    fireEvent.keyDown(high.handle, { key: "ArrowRight", shiftKey: true });
    expect(high.onChange).toHaveBeenCalledWith(480);
  });

  it("leaves other keys alone", () => {
    const { handle, onChange } = setup();
    fireEvent.keyDown(handle, { key: "a" });
    fireEvent.keyDown(handle, { key: "Tab" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the width live while it is dragged and remembers it once, when the drag ends", () => {
    const { handle, onChange, shell } = setup(300);
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 300 });
    expect(shell?.classList.contains("ws--resizing")).toBe(true);
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 360 });
    expect(shell?.style.getPropertyValue("--rail-w")).toBe("360px");
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400 });
    expect(shell?.style.getPropertyValue("--rail-w")).toBe("400px");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 400 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(400);
    expect(shell?.classList.contains("ws--resizing")).toBe(false);
  });

  it("holds a drag to 300 to 480 px", () => {
    const { handle, onChange } = setup(300);
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 300 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 900 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(480);
    fireEvent.pointerDown(handle, { pointerId: 2, button: 0, clientX: 900 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: -500 });
    fireEvent.pointerUp(handle, { pointerId: 2 });
    expect(onChange).toHaveBeenLastCalledWith(300);
  });

  it("ignores the move of a pointer that is not dragging, and a press that is not the main button", () => {
    const { handle, onChange, shell } = setup(300);
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400 });
    fireEvent.pointerDown(handle, { pointerId: 1, button: 2, clientX: 300 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400 });
    expect(shell?.style.getPropertyValue("--rail-w")).toBe("300px");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("goes back to 300 on a double click", () => {
    const { handle, onChange } = setup(420);
    fireEvent.dblClick(handle);
    expect(onChange).toHaveBeenCalledWith(300);
  });

  it("has none on a phone, where the rail is the sheet", () => {
    render(
      <Workspace
        {...slots}
        railWidth={{ value: 300, onChange: vi.fn() }}
        sheet={{
          label: "The box and what's inside",
          title: "What's inside",
          expanded: false,
          onExpandedChange: vi.fn(),
        }}
      />,
    );
    expect(screen.queryByRole("separator")).toBeNull();
  });
});
