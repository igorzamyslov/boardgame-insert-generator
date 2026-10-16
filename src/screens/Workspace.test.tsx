// @vitest-environment jsdom
// src/screens/Workspace.test.tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
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
