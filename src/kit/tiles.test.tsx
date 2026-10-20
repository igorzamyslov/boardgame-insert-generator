// src/kit/tiles.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GripIcon, GroupGlyph } from "./icons";
import { IconTile } from "./IconTile";
import { KindTile } from "./KindTile";
import { StepBadge } from "./StepBadge";

afterEach(cleanup);

describe("IconTile", () => {
  it("wears the kind's line only when asked (MobileTray's header)", () => {
    const { container } = render(
      <>
        <IconTile size={36} kind="minis" lined />
        <IconTile size={36} kind="minis" />
      </>,
    );
    const [lined, plain] = [...container.querySelectorAll(".k-tile")];
    expect(lined?.classList.contains("k-tile--lined")).toBe(true);
    expect(plain?.classList.contains("k-tile--lined")).toBe(false);
  });

  it("takes the kind's colours and draws its icon, hidden from assistive technology", () => {
    const { container } = render(<IconTile size={36} kind="cards" />);
    const tile = container.querySelector(".k-tile");
    expect(tile?.getAttribute("data-kind")).toBe("cards");
    expect(tile?.classList.contains("k-tile--36")).toBe(true);
    expect(tile?.getAttribute("aria-hidden")).toBe("true");
    expect(tile?.querySelector("svg")).toBeTruthy();
  });

  it("is a neutral ground when it has no kind", () => {
    const { container } = render(
      <IconTile size={40}>
        <span>x</span>
      </IconTile>,
    );
    expect(container.querySelector(".k-tile")?.hasAttribute("data-kind")).toBe(false);
  });
});

describe("GroupGlyph and GripIcon", () => {
  it("draw a tray with two walls and six grip dots, both hidden from assistive technology", () => {
    const { container } = render(
      <>
        <GroupGlyph size={17} />
        <GripIcon />
      </>,
    );
    const [glyph, grip] = [...container.querySelectorAll("svg")];
    expect(glyph?.getAttribute("aria-hidden")).toBe("true");
    expect(glyph?.getAttribute("width")).toBe("17");
    expect(glyph?.querySelector("rect")).toBeTruthy();
    expect(glyph?.querySelectorAll("path")).toHaveLength(1);
    expect(grip?.getAttribute("aria-hidden")).toBe("true");
    expect(grip?.querySelectorAll("circle")).toHaveLength(6);
  });

  it("make the group's neutral tile: the icon ground with the strong ink", () => {
    const { container } = render(
      <IconTile size={36} tone="group">
        <GroupGlyph size={17} />
      </IconTile>,
    );
    const tile = container.querySelector(".k-tile");
    expect(tile?.getAttribute("data-tone")).toBe("group");
    expect(tile?.hasAttribute("data-kind")).toBe(false);
  });
});

describe("KindTile", () => {
  it("is Group's tile too: the neutral tile and the group glyph", () => {
    render(<KindTile kind="group">Group</KindTile>);
    const button = screen.getByRole("button", { name: "Group" });
    expect(button.querySelector(".k-tile")?.getAttribute("data-tone")).toBe("group");
    expect(button.querySelector("svg rect")).toBeTruthy();
  });

  it("is a button named by its words", () => {
    const onClick = vi.fn();
    render(
      <KindTile kind="bulk" onClick={onClick}>
        Tokens and dice
      </KindTile>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tokens and dice" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("StepBadge", () => {
  it("is the active step in ink and the next one in the neutral ground", () => {
    const { container } = render(
      <>
        <StepBadge n={1} active />
        <StepBadge n={2} />
      </>,
    );
    const badges = container.querySelectorAll(".k-step");
    expect(badges[0]?.hasAttribute("data-active")).toBe(true);
    expect(badges[1]?.hasAttribute("data-active")).toBe(false);
    expect(badges[1]?.textContent).toBe("2");
  });
});
