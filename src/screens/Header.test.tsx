// src/screens/Header.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRef } from "preact";
import type { SaveState } from "../app/state";
import { Header } from "./Header";
import type { HeaderProps } from "./Header";

afterEach(cleanup);

function props(over: Partial<HeaderProps> = {}): HeaderProps {
  return {
    name: "Wingspan",
    phone: false,
    onSendFile: vi.fn(),
    onRename: vi.fn(),
    saveState: "saved",
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onDownload: vi.fn(),
    downloadDisabled: false,
    menuDot: false,
    menu: (close) => (
      <button type="button" onClick={close}>
        Inside the menu
      </button>
    ),
    ...over,
  };
}

describe("Header", () => {
  it("has one h1 with the wordmark and an editable project name", () => {
    const p = props({ name: "Harbour Kings" });
    const { rerender } = render(<Header {...p} />);
    const banner = document.body;
    expect(
      within(banner).getByRole("heading", { level: 1, name: "Insert Generator" }),
    ).toBeTruthy();
    const name = screen.getByRole("button", { name: "Harbour Kings" });
    expect(name.textContent).toBe("Harbour Kings");
    fireEvent.click(name);
    const input = screen.getByLabelText("Project name") as HTMLInputElement;
    expect(input.value).toBe("Harbour Kings");
    expect(document.activeElement).toBe(input);
    fireEvent.input(input, { target: { value: "Harbour Kings 2" } });
    expect(p.onRename).toHaveBeenCalledWith("Harbour Kings 2");
    fireEvent.keyDown(input, { key: "Enter" });
    // Enter ends the editing: the button is back, with the focus on it
    expect(screen.queryByLabelText("Project name")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Harbour Kings" }));
    // while the screen has its own h1, the wordmark is a plain span
    rerender(<Header {...p} brandIsHeading={false} />);
    expect(within(banner).queryByRole("heading", { level: 1 })).toBeNull();
    expect(within(banner).getByText("Insert Generator").localName).toBe("span");
  });

  it("shows Undo and Redo on desktop, Undo only on a phone", () => {
    const { rerender } = render(<Header {...props()} />);
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Redo" })).toBeTruthy();
    rerender(<Header {...props({ phone: true })} />);
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Redo" })).toBeNull();
  });

  it("offers Send file in the phone header, and only there", () => {
    const p = props({ phone: true });
    const { rerender } = render(<Header {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Send file" }));
    expect(p.onSendFile).toHaveBeenCalledTimes(1);
    rerender(<Header {...props()} />);
    expect(screen.queryByRole("button", { name: "Send file" })).toBeNull();
  });

  it("keeps the project menu button on a phone", () => {
    render(<Header {...props({ phone: true })} />);
    expect(screen.getByRole("button", { name: "Project menu" })).toBeTruthy();
  });

  it("draws the phone's name over where it is saved, and Download as an icon", () => {
    const { container } = render(<Header {...props({ phone: true, name: "Harbour Kings" })} />);
    const block = container.querySelector(".hd-who");
    expect(block?.textContent).toContain("Harbour Kings");
    expect(block?.textContent).toContain("Saved in this browser");
    expect(screen.getByRole("button", { name: "Download" }).classList.contains("k-iconbtn")).toBe(
      true,
    );
    // the wordmark is still the page's h1, for readers: the logo says it to everyone else
    expect(screen.getByRole("heading", { level: 1, name: "Insert Generator" })).toBeTruthy();
    expect(container.querySelector(".hd-wordmark")?.classList.contains("visually-hidden")).toBe(
      true,
    );
  });

  it("blocks the phone's Download with its reason as title and description", () => {
    render(
      <Header
        {...props({ phone: true, downloadDisabled: true, downloadReason: "Make a new plan first" })}
      />,
    );
    const b = screen.getByRole("button", { name: "Download" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.getAttribute("title")).toBe("Make a new plan first");
    expect(document.getElementById(b.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Make a new plan first",
    );
  });

  it("hands the Download button to the app's ref", () => {
    const downloadRef = createRef<HTMLButtonElement>();
    render(<Header {...props({ downloadRef })} />);
    expect(downloadRef.current).toBe(screen.getByRole("button", { name: "Download" }));
  });

  it("shows Saved in this browser, and says nothing for routine saving", () => {
    render(<Header {...props({ saveState: "saved" })} />);
    expect(screen.getByText("Saved in this browser")).toBeTruthy();
    // the live region is there, empty: routine saving is not announced
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("shows Saving paused, and announces it", () => {
    render(<Header {...props({ saveState: "paused" })} />);
    expect(screen.getByRole("status").textContent).toBe("Saving paused");
  });

  it("says what each other save state means, in a live region that stays mounted", () => {
    const text: Record<SaveState, string> = {
      saved: "Saved in this browser",
      saving: "Saving…",
      paused: "Saving paused",
      failed: "Couldn't save",
      unavailable: "Not saved: this browser blocks storage",
    };
    const { rerender, container } = render(<Header {...props()} />);
    const region = screen.getByRole("status");
    const announced = ["paused", "failed", "unavailable"];
    for (const [state, expected] of Object.entries(text)) {
      rerender(<Header {...props({ saveState: state as SaveState })} />);
      expect(container.querySelector(".saved-status")?.textContent).toContain(expected);
      // only the states that need attention are spoken, and the region is the same element
      expect(screen.getByRole("status")).toBe(region);
      expect(region.textContent).toBe(announced.includes(state) ? expected : "");
    }
  });

  it("Undo and Redo follow history", () => {
    const p = props({ canUndo: true, canRedo: false });
    const { rerender } = render(<Header {...p} />);
    const undo = () => screen.getByRole("button", { name: "Undo" });
    const redo = () => screen.getByRole("button", { name: "Redo" });
    expect(undo().getAttribute("aria-disabled")).not.toBe("true");
    expect(redo().getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(redo().getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Nothing to redo");
    fireEvent.click(undo());
    expect(p.onUndo).toHaveBeenCalledTimes(1);
    fireEvent.click(redo());
    expect(p.onRedo).not.toHaveBeenCalled();
    rerender(<Header {...props({ ...p, canUndo: false, canRedo: true })} />);
    expect(undo().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(undo());
    expect(p.onUndo).toHaveBeenCalledTimes(1);
    fireEvent.click(redo());
    expect(p.onRedo).toHaveBeenCalledTimes(1);
  });

  it("keeps Undo and Redo in the Tab order when there is nothing to step to", () => {
    render(<Header {...props()} />);
    for (const name of ["Undo", "Redo"]) {
      const b = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(b.disabled).toBe(false);
      expect(b.tabIndex).toBe(0);
      b.focus();
      expect(document.activeElement).toBe(b);
    }
  });

  it("Download calls out, and is off while there is nothing to download", () => {
    const p = props();
    const { rerender } = render(<Header {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(p.onDownload).toHaveBeenCalledTimes(1);
    rerender(<Header {...props({ downloadDisabled: true })} />);
    const off = screen.getByRole("button", { name: "Download" });
    expect(off.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(off);
    expect(p.onDownload).toHaveBeenCalledTimes(1);
  });

  it("can name what is wrong on the Download button itself", () => {
    const p = props({ downloadDisabled: true, downloadLabel: "Fix the fit to download" });
    render(<Header {...p} />);
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
    const b = screen.getByRole("button", { name: "Fix the fit to download" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(b);
    expect(p.onDownload).not.toHaveBeenCalled();
  });

  it("tells a press on the blocked Download, and only then", () => {
    const onBlockedDownload = vi.fn();
    const { rerender } = render(<Header {...props({ onBlockedDownload })} />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(onBlockedDownload).not.toHaveBeenCalled();
    rerender(<Header {...props({ downloadDisabled: true, onBlockedDownload })} />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(onBlockedDownload).toHaveBeenCalledTimes(1);
  });

  it("titles a blocked Undo and Redo with the reason, not the shortcut", () => {
    render(<Header {...props({ canUndo: false, canRedo: false })} />);
    expect(screen.getByRole("button", { name: "Undo" }).getAttribute("title")).toBe(
      "Nothing to undo",
    );
    expect(screen.getByRole("button", { name: "Redo" }).getAttribute("title")).toBe(
      "Nothing to redo",
    );
    // the shortcut is still announced for assistive technology
    expect(
      screen.getByRole("button", { name: "Redo" }).getAttribute("aria-keyshortcuts"),
    ).toContain("Control+Y");
  });

  it("points aria-controls at the menu only while it is open", () => {
    render(<Header {...props()} />);
    const button = screen.getByRole("button", { name: "Project menu" });
    expect(button.hasAttribute("aria-controls")).toBe(false);
    fireEvent.click(button);
    expect(document.getElementById(button.getAttribute("aria-controls") ?? "")).not.toBeNull();
  });

  it("names the shortcuts in the Undo and Redo titles, Command on a Mac", () => {
    const { unmount } = render(<Header {...props({ canUndo: true, canRedo: true })} />);
    expect(screen.getByRole("button", { name: "Undo" }).getAttribute("title")).toBe(
      "Undo (Ctrl+Z)",
    );
    expect(screen.getByRole("button", { name: "Redo" }).getAttribute("title")).toBe(
      "Redo (Ctrl+Y)",
    );
    expect(screen.getByRole("button", { name: "Undo" }).getAttribute("aria-keyshortcuts")).toBe(
      "Control+Z Meta+Z",
    );
    unmount();
    const platform = vi.spyOn(window.navigator, "platform", "get").mockReturnValue("MacIntel");
    try {
      render(<Header {...props({ canUndo: true, canRedo: true })} />);
      expect(screen.getByRole("button", { name: "Undo" }).getAttribute("title")).toBe("Undo (⌘Z)");
      expect(screen.getByRole("button", { name: "Redo" }).getAttribute("title")).toBe("Redo (⇧⌘Z)");
    } finally {
      platform.mockRestore();
    }
  });

  it("gives the reason Download is off as its title and description", () => {
    render(
      <Header {...props({ downloadDisabled: true, downloadReason: "Make a new plan first" })} />,
    );
    const b = screen.getByRole("button", { name: "Download" });
    expect(b.getAttribute("title")).toBe("Make a new plan first");
    expect(document.getElementById(b.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Make a new plan first",
    );
  });

  it("opens the project menu, closes it on Escape and returns focus to its button", () => {
    render(<Header {...props()} />);
    const button = screen.getByRole("button", { name: "Project menu" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Inside the menu")).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Inside the menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Inside the menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("closes on a click outside it, not on a click inside, and when the content asks", () => {
    render(<Header {...props()} />);
    const button = screen.getByRole("button", { name: "Project menu" });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "Wingspan" }));
    expect(screen.queryByText("Inside the menu")).toBeNull();
    fireEvent.click(button);
    fireEvent.click(screen.getByText("Inside the menu").parentElement as HTMLElement);
    expect(screen.getByText("Inside the menu")).toBeTruthy();
    fireEvent.click(screen.getByText("Inside the menu"));
    expect(screen.queryByText("Inside the menu")).toBeNull();
  });

  it("stays open when a choice inside it replaces its own button (Your inserts)", () => {
    render(
      <Header
        {...props({
          menu: () => (
            <button type="button" onClick={(e) => e.currentTarget.remove()}>
              Swaps its page
            </button>
          ),
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
    fireEvent.click(screen.getByText("Swaps its page"));
    expect(screen.getByRole("button", { name: "Project menu" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("is a disclosure, not an ARIA menu", () => {
    render(<Header {...props()} />);
    expect(screen.getByRole("button", { name: "Project menu" }).hasAttribute("aria-haspopup")).toBe(
      false,
    );
  });

  it("moves the focus to the first item when the menu opens", () => {
    render(<Header {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
    expect(document.activeElement).toBe(screen.getByText("Inside the menu"));
  });

  it("puts the focus back on the menu button after a choice", () => {
    render(<Header {...props()} />);
    const button = screen.getByRole("button", { name: "Project menu" });
    fireEvent.click(button);
    fireEvent.click(screen.getByText("Inside the menu"));
    expect(screen.queryByText("Inside the menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("closes when the focus leaves it for somewhere else, and leaves the focus there", () => {
    render(<Header {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
    const name = screen.getByRole("button", { name: "Wingspan" });
    fireEvent.blur(screen.getByText("Inside the menu"), { relatedTarget: name });
    expect(screen.queryByText("Inside the menu")).toBeNull();
    // focus moving between the menu's own buttons keeps it open
    fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
    fireEvent.blur(screen.getByText("Inside the menu"), {
      relatedTarget: screen.getByRole("button", { name: "Project menu" }),
    });
    expect(screen.getByText("Inside the menu")).toBeTruthy();
  });

  /** Opens the name for editing, as a click on the name button does. */
  const edit = (name = "Wingspan"): HTMLInputElement => {
    fireEvent.click(screen.getByRole("button", { name }));
    return screen.getByLabelText("Project name") as HTMLInputElement;
  };

  it("commits the name as it is typed, trims it on blur and goes back to the button", () => {
    const p = props();
    render(<Header {...p} />);
    const name = edit();
    fireEvent.input(name, { target: { value: "  Everdell  " } });
    fireEvent.blur(name);
    expect(p.onRename).toHaveBeenLastCalledWith("Everdell");
    expect(screen.queryByLabelText("Project name")).toBeNull();
  });

  it("reverts the name on Escape to what it was when editing began", () => {
    const q = props({ name: "Wingspan" });
    render(<Header {...q} />);
    const again = edit();
    fireEvent.input(again, { target: { value: "Oops" } });
    fireEvent.keyDown(again, { key: "Escape" });
    expect(q.onRename).toHaveBeenLastCalledWith("Wingspan");
    expect(screen.queryByLabelText("Project name")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Wingspan" }));
  });

  it("leaves the name alone on Escape when nothing changed", () => {
    const q = props();
    render(<Header {...q} />);
    fireEvent.keyDown(edit(), { key: "Escape" });
    expect(q.onRename).not.toHaveBeenCalled();
  });

  it("shows an unnamed insert as such, and edits it", () => {
    render(<Header {...props({ name: "" })} />);
    const input = edit("(unnamed)");
    expect(input.value).toBe("");
  });

  it("ignores Escape and outside clicks while the menu is closed", () => {
    render(<Header {...props()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(document.body);
    expect(screen.getByRole("button", { name: "Project menu" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("marks the menu button with a dot when something inside needs a look", () => {
    const { rerender, container } = render(<Header {...props()} />);
    expect(container.querySelector(".k-iconbtn__dot")).toBeNull();
    rerender(<Header {...props({ menuDot: true, menuNoticeCount: 1 })} />);
    expect(container.querySelector(".k-iconbtn__dot")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Project menu, 1 notice" })).toBeTruthy();
    rerender(<Header {...props({ menuDot: true, menuNoticeCount: 2 })} />);
    expect(screen.getByRole("button", { name: "Project menu, 2 notices" })).toBeTruthy();
  });
});
