// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/preact";
import { App } from "./App";
import { APP_VERSION } from "../model/version";

afterEach(cleanup);

describe("App shell", () => {
  it("shows the preview banner", () => {
    render(<App />);
    expect(screen.getByRole("note").textContent).toMatch(/links may break/i);
  });

  it("shows the app version in the footer", () => {
    render(<App />);
    expect(screen.getByRole("contentinfo").textContent).toContain(`v${APP_VERSION}`);
  });
});
