// @vitest-environment jsdom
// The tray bar of a selected tray, wired to the project: a group's tray (G1) is called by its
// group's name, drawn as a tiny tray of its members' colours, and its Edit opens the group.
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureProject, makeLayout, makeTray } from "../app/test-helpers";
import { inputsHash } from "../model/hash";
import { newComponent } from "../model/defaults";
import type { CompartmentSpec, Project, TraySpec } from "../model/types";
import { SelectedTrayBar } from "./SelectedTrayBar";
import type { SelectedTrayBarProps } from "./SelectedTrayBar";
import { shadeHex } from "./identity";

afterEach(cleanup);

const starter = { ...newComponent("cards"), id: "starter", name: "Starter deck" };
const bits = { ...newComponent("bulk"), id: "bits", name: "Resources" };
const hero = { ...newComponent("minis"), id: "hero", name: "Hero" };
const market = { ...newComponent("cards"), id: "market", name: "Market deck" };

const well = (id: string, contents: string, x: number, w: number): CompartmentSpec => ({
  x,
  y: 2,
  w,
  d: 60,
  floorZ: 1.2,
  kind: "well",
  contents,
  componentId: id,
  features: [],
});

function kitProject(copies = 2): Project {
  const base = fixtureProject();
  const components = [starter, bits, hero, market];
  const trays = [
    ...Array.from({ length: copies }, (_, n) =>
      makeTray({
        key: `kit:p${n}:0`,
        path: String(n),
        stack: n,
        x: 100,
        y: n * 70,
        w: 190,
        d: 71,
        h: 38,
        compartments: [
          well("starter", "Starter deck ×12", 2, 50),
          well("bits", "Resources ×10", 54, 40),
          well("bits", "Resources ×10", 96, 40),
          well("hero", "Hero ×1", 138, 40),
        ],
      }),
    ),
    makeTray({
      key: "market:p0:0",
      path: "9",
      stack: 9,
      w: 95,
      d: 190,
      compartments: [well("market", "Market deck ×80", 2, 90)],
    }),
  ];
  const next: Project = {
    ...base,
    components,
    groups: [
      {
        id: "kit",
        name: "Player kit",
        copies,
        access: "often",
        memberIds: ["starter", "bits", "hero"],
      },
    ],
    locks: [],
    box: { ...base.box, innerHeight: 200 },
  };
  return { ...next, layout: makeLayout(inputsHash(next), trays) };
}

function bar(selectedKey: string, over: Partial<SelectedTrayBarProps> = {}) {
  const project = over.project ?? kitProject();
  const p: SelectedTrayBarProps = {
    project,
    trays: project.layout?.trays ?? [],
    selectedKey,
    inPlan: true,
    phone: false,
    swapFrom: null,
    edit: vi.fn(),
    onSelect: vi.fn(),
    onSwapFromChange: vi.fn(),
    onEditComponent: vi.fn(),
    ...over,
  };
  return { p, view: render(<SelectedTrayBar {...p} />) };
}

const region = (): HTMLElement => screen.getByRole("region", { name: "Selected tray" });

describe("SelectedTrayBar for a group's tray", () => {
  it("is called by the group's name and copy", () => {
    bar("kit:p1:0");
    expect(region().querySelector(".tray-bar__name")?.textContent).toBe("Player kit 2");
  });

  it("draws the swatch as a tiny tray: the members' kind colours in order, one cell each", () => {
    bar("kit:p1:0");
    const cells = [...region().querySelectorAll<HTMLElement>(".tray-bar__cell")];
    expect(cells).toHaveLength(3);
    const fills = cells.map((c) => c.style.getPropertyValue("--cell-own-fill"));
    expect(fills[0]).toContain(shadeHex("cards", 0, "light").fill);
    expect(fills[1]).toContain(shadeHex("bulk", 0, "light").fill);
    expect(fills[2]).toContain(shadeHex("minis", 0, "light").fill);
  });

  it("says its size, how many compartments it has, and what it costs to print", () => {
    bar("kit:p1:0");
    expect(region().querySelector(".tray-bar__meta")?.textContent).toMatch(
      /^190 × 71 × 38 mm · 4 compartments · about [\d.]+ (h|min), \d+ g$/,
    );
  });

  it("opens the group's editor with Edit, not a member's", () => {
    const onEditGroup = vi.fn();
    const { p } = bar("kit:p1:0", { onEditGroup });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEditGroup).toHaveBeenCalledTimes(1);
    expect(onEditGroup).toHaveBeenCalledWith("kit");
    expect(p.onEditComponent).not.toHaveBeenCalled();
  });

  it("names a split copy's trays with a letter", () => {
    const project = kitProject(1);
    const second = makeTray({
      ...(project.layout?.trays[0] as TraySpec),
      key: "kit:p0:1",
      path: "8",
    });
    const trays = [...(project.layout?.trays ?? []), second];
    bar("kit:p0:1", { project, trays });
    expect(region().querySelector(".tray-bar__name")?.textContent).toBe("Player kit b");
  });

  it("leaves an ungrouped tray as it was: its kind's swatch, its layer, Edit for the item", () => {
    const { p } = bar("market:p0:0");
    expect(region().querySelector(".tray-bar__name")?.textContent).toBe("Market deck");
    expect(region().querySelector(".tray-bar__swatch--group")).toBeNull();
    expect(region().querySelector(".tray-bar__meta")?.textContent).toMatch(/^Layer 1 · /);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(p.onEditComponent).toHaveBeenCalledWith("market");
  });
});
