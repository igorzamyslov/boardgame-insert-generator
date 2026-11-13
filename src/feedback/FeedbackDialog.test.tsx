// src/feedback/FeedbackDialog.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ATTACH_NOTE,
  CHECKING,
  FeedbackDialog,
  GITHUB_NOTE,
  MISSING_MESSAGE,
  PUBLIC_NOTE,
} from "./FeedbackDialog";
import type { FeedbackDialogProps } from "./FeedbackDialog";
import type { SendResult } from "./feedback";
import type { TurnstileApi } from "./turnstile";

afterEach(cleanup);

const WORKER = { url: "https://w.example/", siteKey: "0xKEY" };
const NONE = { url: "", siteKey: "" };

/** A Turnstile that hands over a token when the widget is drawn. */
function fakeCheck(token = "tok-1") {
  const api = {
    render: vi.fn((_el: HTMLElement, o: { callback: (t: string) => void }) => {
      queueMicrotask(() => o.callback(token));
      return "w1";
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  return { api, load: () => Promise.resolve(api as unknown as TurnstileApi) };
}

function show(over: Partial<FeedbackDialogProps> = {}) {
  const check = fakeCheck();
  const send = vi.fn<NonNullable<FeedbackDialogProps["send"]>>(async (): Promise<SendResult> => ({
    ok: true,
    issueUrl: "https://github.com/o/r/issues/12",
    number: 12,
  }));
  const openPage = vi.fn<(u: string) => void>();
  const getProject = vi.fn(() => '{"name":"Mine"}');
  const onClose = vi.fn();
  render(
    <FeedbackDialog
      config={WORKER}
      appVersion="0.30.0 (abc)"
      userAgent="UA/1"
      getProject={getProject}
      onClose={onClose}
      send={send}
      loadCheck={check.load}
      openPage={openPage}
      {...over}
    />,
  );
  return { check, send, openPage, getProject, onClose };
}

const write = (text: string): void => {
  fireEvent.input(screen.getByLabelText("Your message"), { target: { value: text } });
};
const sendButton = (name: RegExp | string = /^Send$/): HTMLElement =>
  screen.getByRole("button", { name });
const checked = () => act(() => Promise.resolve());
/** The check has answered: Send is no longer held. */
const ready = (name: RegExp | string = /^Send$/) =>
  waitFor(() => expect(sendButton(name).getAttribute("aria-disabled")).toBeNull());

describe("FeedbackDialog", () => {
  it("opens empty: the three kinds, a message, a contact, the chip, the public note and a blocked Send", async () => {
    show();
    await checked();
    expect(screen.getByRole("dialog", { name: "Send feedback" })).toBeTruthy();
    const kinds = screen.getByRole("group", { name: "What is it about?" });
    expect(kinds.textContent).toContain("Idea");
    expect(kinds.textContent).toContain("Problem");
    expect(kinds.textContent).toContain("Something else");
    expect(screen.getByRole("button", { name: "Idea" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("How to reach you (optional)")).toBeTruthy();
    const chip = screen.getByRole("button", { name: "Attach my insert design" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(PUBLIC_NOTE, { exact: false })).toBeTruthy();
    // blocked but focusable, and it says why
    const send = sendButton();
    expect(send.getAttribute("aria-disabled")).toBe("true");
    expect(send.getAttribute("disabled")).toBeNull();
    expect(screen.getByText(MISSING_MESSAGE)).toBeTruthy();
  });

  it("waits for the check, then sends with the token; the project is not attached unless ticked", async () => {
    const { send, getProject } = show();
    write("It would help to rotate trays.");
    fireEvent.click(screen.getByRole("button", { name: "Something else" }));
    fireEvent.input(screen.getByLabelText("How to reach you (optional)"), {
      target: { value: "me@example.com" },
    });
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const [url, payload] = send.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(url).toBe("https://w.example/");
    expect(payload).toMatchObject({
      message: "It would help to rotate trays.",
      kind: "other",
      contact: "me@example.com",
      includeProject: false,
      appVersion: "0.30.0 (abc)",
      userAgent: "UA/1",
      turnstileToken: "tok-1",
    });
    expect("project" in payload).toBe(false);
    expect(getProject).not.toHaveBeenCalled();
  });

  it("attaches the insert design only when the chip is on, and says it is public", async () => {
    const { send, getProject } = show();
    write("Look at this plan");
    await ready();
    const chip = screen.getByRole("button", { name: "Attach my insert design" });
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(ATTACH_NOTE, { exact: false })).toBeTruthy();
    fireEvent.click(sendButton());
    await waitFor(() => expect(send).toHaveBeenCalled());
    const payload = send.mock.calls[0]?.[1] as unknown as Record<string, unknown>;
    expect(payload.includeProject).toBe(true);
    expect(payload.project).toBe('{"name":"Mine"}');
    expect(getProject).toHaveBeenCalledTimes(1);
  });

  it("holds Send while the check has not answered, and says so", async () => {
    show({
      loadCheck: () => new Promise<TurnstileApi>(() => undefined),
    });
    write("Hello");
    const send = sendButton();
    expect(send.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(CHECKING)).toBeTruthy();
  });

  it("says thank you with the issue, after a send", async () => {
    show();
    write("Great");
    await ready();
    fireEvent.click(sendButton());
    const h1 = await screen.findByRole("heading", { name: "Thank you" });
    expect(screen.getByText("Your feedback is on GitHub as issue 12.")).toBeTruthy();
    const link = screen.getByRole("link", { name: /See it on GitHub/ });
    expect(link.getAttribute("href")).toBe("https://github.com/o/r/issues/12");
    expect(document.activeElement).toBe(h1);
    expect(screen.queryByLabelText("Your message")).toBeNull();
    expect(document.querySelector('[data-live="feedback"]')?.textContent).toBe("Sent. Thank you.");
  });

  it("on a failure keeps every word and offers Try again, with a new check", async () => {
    const { check } = show({
      send: vi.fn(async (): Promise<SendResult> => ({
        ok: false,
        message: "It didn't go through. Your words are still here: try again.",
      })),
    });
    write("Keep this text");
    fireEvent.input(screen.getByLabelText("How to reach you (optional)"), {
      target: { value: "x@y.z" },
    });
    await ready();
    fireEvent.click(sendButton());
    await screen.findByText("Not sent.", { selector: "strong" });
    expect((screen.getByLabelText("Your message") as HTMLTextAreaElement).value).toBe(
      "Keep this text",
    );
    expect((screen.getByLabelText("How to reach you (optional)") as HTMLInputElement).value).toBe(
      "x@y.z",
    );
    expect(check.api.reset).toHaveBeenCalledWith("w1");
    expect(document.querySelector('[data-live="feedback"]')?.textContent).toContain("Not sent.");
    // the new check hands a new token, then Try again works
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(CHECKING)).toBeTruthy();
  });

  it("without a Worker, Send is Open GitHub: it opens the filled-in page and attaches nothing", async () => {
    const { openPage, send, getProject } = show({ config: NONE });
    expect(screen.queryByRole("button", { name: "Attach my insert design" })).toBeNull();
    expect(screen.getByText(GITHUB_NOTE, { exact: false })).toBeTruthy();
    write("A idea\nwith two lines");
    fireEvent.click(screen.getByRole("button", { name: "Open GitHub" }));
    expect(send).not.toHaveBeenCalled();
    expect(getProject).not.toHaveBeenCalled();
    expect(openPage).toHaveBeenCalledTimes(1);
    const url = new URL(openPage.mock.calls[0]?.[0] ?? "");
    expect(url.host).toBe("github.com");
    expect(url.pathname).toMatch(/\/issues\/new$/);
    expect(url.searchParams.get("template")).toBe("feedback.yml");
    expect(url.searchParams.get("labels")).toBe("feedback");
    expect(url.searchParams.get("message")).toBe("A idea\nwith two lines");
    expect(screen.getByRole("heading", { name: "One more step" })).toBeTruthy();
  });

  it("loads nothing from Cloudflare when no site key is set", () => {
    const load = vi.fn();
    show({ config: { url: "https://w.example/", siteKey: "" }, loadCheck: load });
    expect(load).not.toHaveBeenCalled();
  });

  it("falls back to GitHub when the check script cannot load", async () => {
    show({ loadCheck: () => Promise.reject(new Error("blocked")) });
    await checked();
    expect(screen.getByRole("button", { name: "Open GitHub" })).toBeTruthy();
  });

  it("Escape closes it", async () => {
    const { onClose } = show();
    await checked();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalled();
  });
});
