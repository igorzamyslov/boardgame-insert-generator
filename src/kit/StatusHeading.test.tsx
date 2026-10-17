// src/kit/StatusHeading.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { StatusHeading } from "./StatusHeading";

afterEach(cleanup);

describe("StatusHeading", () => {
  it("is the page heading", () => {
    const { container } = render(
      <StatusHeading
        tone="fit"
        title="Everything fits"
        line="10 trays in 2 layers, 66 of 70 mm high"
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Everything fits" })).toBeTruthy();
    expect(container.querySelector(".k-status__icon")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("10 trays in 2 layers, 66 of 70 mm high")).toBeTruthy();
  });

  it("keeps a long title on one line and gives the whole of it in a title", () => {
    const title = "The Heroes tray does not fit the box yet at this height";
    render(<StatusHeading tone="warn" title={title} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.classList.contains("ellipsis")).toBe(true);
    expect(h1.getAttribute("title")).toBe(title);
  });

  it("names its tone, and has room for what sits beside it", () => {
    const { container } = render(
      <StatusHeading
        tone="info"
        title="Searching for a better plan…"
        extra={<button type="button">Stop</button>}
      />,
    );
    expect(container.querySelector(".k-status")?.getAttribute("data-tone")).toBe("info");
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
  });

  it("draws an icon for every tone", () => {
    for (const tone of ["fit", "info", "warn", "error", "neutral"] as const) {
      const { container } = render(<StatusHeading tone={tone} title="x" />);
      expect(container.querySelector(".k-status__icon svg"), tone).toBeTruthy();
      cleanup();
    }
  });

  it("takes a line made of several lines", () => {
    render(
      <StatusHeading
        tone="error"
        title="Fix the errors marked in the inputs"
        line={
          <ul aria-label="Errors without a field">
            <li>Lock 1 is broken.</li>
          </ul>
        }
      />,
    );
    expect(screen.getByRole("list", { name: "Errors without a field" })).toBeTruthy();
  });
});
