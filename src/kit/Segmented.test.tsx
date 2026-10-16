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
});
