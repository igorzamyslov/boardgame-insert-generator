// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/preact";
import { App } from "./App";

vi.mock("../model/version", async (orig) => ({
  ...(await orig<typeof import("../model/version")>()),
  APP_VERSION: "1.0.0",
}));

afterEach(cleanup);

describe("App shell for a release version", () => {
  it("hides the preview banner", () => {
    render(<App />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("shows the release version in the footer", () => {
    render(<App />);
    expect(screen.getByRole("contentinfo").textContent).toContain("v1.0.0");
  });
});
