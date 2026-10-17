// src/kit/ProgressBar.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

afterEach(cleanup);

describe("ProgressBar", () => {
  it("reports its value", () => {
    render(<ProgressBar value={30} label="Building the file" />);
    const bar = screen.getByRole("progressbar", { name: "Building the file" });
    expect(bar.getAttribute("aria-valuenow")).toBe("30");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
  });

  it("keeps the value between 0 and 100", () => {
    const { container } = render(<ProgressBar value={140} label="x" />);
    expect(container.querySelector(".k-progress__bar")?.getAttribute("style")).toContain("100%");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });
});
