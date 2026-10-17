// src/app/App.release.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp, renderWorkspace } from "./test-app";

vi.mock("../model/version", async (orig) => ({
  ...(await orig<typeof import("../model/version")>()),
  APP_VERSION: "1.0.0",
  BUILD_ID: "abc1234",
}));

afterEach(cleanup);

describe("App shell for a release version", () => {
  it("hides the preview banner", () => {
    renderApp();
    // a text query: the 3D view's no-WebGL fallback is a role="note" too
    expect(screen.queryByText(/shared links may break/)).toBeNull();
  });

  it("shows the release version and the build id in the project menu", () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
    expect(screen.getByText("Insert Generator 1.0.0 (abc1234)")).toBeTruthy();
  });
});
