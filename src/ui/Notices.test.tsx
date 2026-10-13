// src/ui/Notices.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import type { Notice } from "../model/types";
import { Notices } from "./Notices";

afterEach(cleanup);

const notice = (level: Notice["level"]): Notice => ({
  level,
  code: `test.${level}`,
  message: `A ${level} message`,
});

describe("Notices", () => {
  it("announces errors as alerts and warnings politely, and leaves notes silent", () => {
    const { container } = render(
      <Notices notices={[notice("error"), notice("warning"), notice("info")]} />,
    );
    expect(screen.getByRole("alert").textContent).toContain("A error message");
    expect(screen.getByRole("status").textContent).toContain("A warning message");
    expect(container.querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByText("A info message").closest("li")?.getAttribute("role")).toBeNull();
  });

  it("offers dismissing unless canDismiss says the notice has to stay", () => {
    const onDismiss = () => undefined;
    render(
      <Notices
        notices={[notice("warning"), notice("info")]}
        onDismiss={onDismiss}
        canDismiss={(n) => n.level !== "warning"}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Dismiss: A warning/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Dismiss: A info/ })).toBeTruthy();
  });
});

describe("Notices markup", () => {
  it("renders each notice as a pf-notice with a level word, the message, and the level class", () => {
    const { container } = render(
      <Notices
        notices={[notice("error"), notice("warning"), notice("info")]}
        label="Layout messages"
        class="stage-block"
      />,
    );
    const list = screen.getByRole("list", { name: "Layout messages" });
    expect(list.className).toContain("notices");
    expect(list.className).toContain("stage-block");
    const items = Array.from(container.querySelectorAll("li"));
    expect(items.map((li) => li.className)).toEqual([
      "pf-notice pf-notice--error",
      "pf-notice pf-notice--warn",
      "pf-notice",
    ]);
    expect(items.map((li) => li.querySelector("strong.notice-level")?.textContent)).toEqual([
      "Error:",
      "Warning:",
      "Note:",
    ]);
  });

  it("puts the action and a dismiss button named after the message in the notice", () => {
    render(
      <Notices
        notices={[notice("info")]}
        onDismiss={() => undefined}
        renderAction={() => <button type="button">Do it</button>}
      />,
    );
    const li = screen.getByText("A info message").closest("li");
    expect(li?.querySelector(".notice-action")?.textContent).toBe("Do it");
    expect(li?.querySelector("button.notice-dismiss")?.getAttribute("aria-label")).toBe(
      "Dismiss: A info message",
    );
  });
});
