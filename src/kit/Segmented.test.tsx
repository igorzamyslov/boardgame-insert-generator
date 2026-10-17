// src/kit/Segmented.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it } from "vitest";
import { Segmented } from "./Segmented";

afterEach(cleanup);

const LAYERS = [
  { value: "bottom", label: "Bottom layer · 40 mm" },
  { value: "top", label: "Top layer · 26 mm" },
];

function Host(p: { tone?: "quiet" | "track" }) {
  const [value, setValue] = useState("bottom");
  return (
    <Segmented label="Layer" options={LAYERS} value={value} onChange={setValue} tone={p.tone} />
  );
}

describe("Segmented", () => {
  it("presses one option", () => {
    render(<Host />);
    const group = screen.getByRole("group", { name: "Layer" });
    const pressed = () =>
      [...group.querySelectorAll("button")].filter(
        (b) => b.getAttribute("aria-pressed") === "true",
      );
    expect(pressed()).toHaveLength(1);
    expect(pressed()[0]?.textContent).toBe("Bottom layer · 40 mm");
    fireEvent.click(screen.getByRole("button", { name: "Top layer · 26 mm" }));
    expect(pressed()).toHaveLength(1);
    expect(pressed()[0]?.textContent).toBe("Top layer · 26 mm");
  });

  it("says which tone it is", () => {
    const { container } = render(<Host tone="track" />);
    expect(container.querySelector(".k-seg")?.getAttribute("data-tone")).toBe("track");
  });

  it("is the quiet tone by default", () => {
    const { container } = render(<Host />);
    expect(container.querySelector(".k-seg")?.getAttribute("data-tone")).toBe("quiet");
  });

  it("blocks one option and says why, as a blocked button does", () => {
    const picked: string[] = [];
    render(
      <Segmented
        label="View"
        options={[
          { value: "top", label: "Top" },
          { value: "3d", label: "3D", blockedReason: "3D needs WebGL" },
        ]}
        value="top"
        onChange={(v) => picked.push(v)}
      />,
    );
    const blocked = screen.getByRole("button", { name: "3D" });
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    expect(blocked.hasAttribute("disabled")).toBe(false);
    expect(blocked.getAttribute("title")).toBe("3D needs WebGL");
    expect(blocked.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.click(blocked);
    expect(picked).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Top" }));
    expect(picked).toEqual(["top"]);
  });

  it("marks a changed option, which takes the changed ink while it is pressed", () => {
    render(
      <Segmented
        label="Walls"
        options={[
          { value: "standard", label: "Standard" },
          { value: "custom", label: "Custom", changed: true },
        ]}
        value="custom"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Custom" }).hasAttribute("data-changed")).toBe(true);
    expect(screen.getByRole("button", { name: "Standard" }).hasAttribute("data-changed")).toBe(
      false,
    );
  });

  it("says an option needs attention: a dot for the eye, words for a reader", () => {
    const { container } = render(
      <Segmented
        label="Settings for"
        options={[
          { value: "insert", label: "This insert", attention: true },
          { value: "printer", label: "My printer" },
        ]}
        value="printer"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "This insert, needs attention" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "My printer" })).toBeTruthy();
    expect(container.querySelectorAll(".k-seg__dot")).toHaveLength(1);
    expect(container.querySelector(".k-seg__dot")?.getAttribute("aria-hidden")).toBe("true");
  });
});
