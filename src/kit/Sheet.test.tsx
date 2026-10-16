// src/kit/Sheet.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import css from "./kit.css?raw";
import { Sheet } from "./Sheet";

afterEach(cleanup);

function Harness(p: {
  start?: boolean;
  full?: boolean;
  peek?: boolean;
  onChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(p.start ?? false);
  return (
    <>
      <button type="button">Elsewhere</button>
      <Sheet
        label="The box and what's inside"
        title="What's inside"
        meta="3 items"
        expanded={open}
        full={p.full}
        peek={p.peek}
        onExpandedChange={(next) => {
          p.onChange?.(next);
          setOpen(next);
        }}
      >
        <button type="button">First control</button>
        <button type="button">Second control</button>
      </Sheet>
    </>
  );
}

const handle = (): HTMLElement => screen.getByRole("button", { name: /What's inside/ });

describe("Sheet", () => {
  it("is a named region whose handle is a button that says whether it is open", () => {
    render(<Harness />);
    expect(screen.getByRole("region", { name: "The box and what's inside" })).toBeTruthy();
    expect(handle().tagName).toBe("BUTTON");
    expect(handle().getAttribute("aria-expanded")).toBe("false");
    expect(handle().textContent).toContain("3 items");
    fireEvent.click(handle());
    expect(handle().getAttribute("aria-expanded")).toBe("true");
  });

  it("wears the kit's classes", () => {
    render(<Harness />);
    expect(screen.getByRole("region").classList.contains("k-sheet")).toBe(true);
    expect(handle().classList.contains("k-sheet__handle")).toBe(true);
  });

  it("points the handle at the content it opens", () => {
    render(<Harness />);
    const id = handle().getAttribute("aria-controls") ?? "";
    expect(document.getElementById(id)?.textContent).toContain("First control");
  });

  it("keeps a folded sheet's content out of reach of keyboard and screen reader", () => {
    render(<Harness />);
    const body = document.getElementById(handle().getAttribute("aria-controls") ?? "");
    expect(body?.hasAttribute("inert")).toBe(true);
    fireEvent.click(handle());
    expect(body?.hasAttribute("inert")).toBe(false);
  });

  it("lets a peeking sheet's content be reached while it is folded", () => {
    render(<Harness peek />);
    const body = document.getElementById(handle().getAttribute("aria-controls") ?? "");
    expect(body?.hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("region").getAttribute("data-peek")).toBe("true");
  });

  it("moves the focus into the sheet when it opens", () => {
    render(<Harness />);
    handle().focus();
    fireEvent.click(handle());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First control" }));
  });

  it("leaves the focus where it is when something inside already took it", () => {
    function Eager() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open it
          </button>
          <Sheet label="Sheet" title="List" expanded={open} onExpandedChange={setOpen}>
            <button type="button">First control</button>
            <button
              type="button"
              ref={(el) => {
                if (open) {
                  el?.focus();
                }
              }}
            >
              Second control
            </button>
          </Sheet>
        </>
      );
    }
    render(<Eager />);
    fireEvent.click(screen.getByRole("button", { name: "Open it" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Second control" }));
  });

  it("closes on Escape and gives the focus back to the handle", () => {
    const onChange = vi.fn();
    render(<Harness start onChange={onChange} />);
    const inside = screen.getByRole("button", { name: "Second control" });
    inside.focus();
    fireEvent.keyDown(inside, { key: "Escape" });
    expect(onChange).toHaveBeenCalledWith(false);
    expect(handle().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(handle());
  });

  it("does nothing on Escape while folded or when something else took the key", () => {
    const onChange = vi.fn();
    const view = render(<Harness onChange={onChange} />);
    fireEvent.keyDown(handle(), { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    view.unmount();
    render(<Harness start onChange={onChange} />);
    const inside = screen.getByRole("button", { name: "First control" });
    inside.addEventListener("keydown", (e) => e.preventDefault());
    fireEvent.keyDown(inside, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not steal the focus when the handle folds it", () => {
    render(<Harness start />);
    handle().focus();
    fireEvent.click(handle());
    expect(document.activeElement).toBe(handle());
    screen.getByRole("button", { name: "Elsewhere" }).focus();
    expect(document.activeElement).not.toBe(handle());
  });

  it("keeps its action beside the handle, reachable while the sheet is folded", () => {
    render(
      <Sheet
        label="Sheet"
        title="List"
        expanded={false}
        onExpandedChange={() => undefined}
        action={<button type="button">Keep searching</button>}
      >
        <p>Inside</p>
      </Sheet>,
    );
    const action = screen.getByRole("button", { name: "Keep searching" });
    expect(action.closest("[inert]")).toBeNull();
    expect(action.parentElement).toBe(screen.getByRole("button", { name: "List" }).parentElement);
  });

  it("marks the editor, and hands its handle to the owner", () => {
    const handleRef = { current: null as HTMLButtonElement | null };
    render(
      <Sheet
        label="Sheet"
        title="List"
        expanded
        editing
        handleRef={handleRef}
        onExpandedChange={() => undefined}
      >
        <p>Inside</p>
      </Sheet>,
    );
    expect(screen.getByRole("region").getAttribute("data-editing")).toBe("true");
    expect(handleRef.current).toBe(screen.getByRole("button", { name: "List" }));
  });

  it("marks a sheet that fills the screen", () => {
    render(<Harness start full />);
    expect(screen.getByRole("region").getAttribute("data-full")).toBe("true");
  });
});

describe("Sheet with a grip button of its own", () => {
  function Gripped() {
    const [open, setOpen] = useState(false);
    return (
      <Sheet
        label="What's inside"
        title="What's inside"
        meta="8"
        handleLabel="Show everything"
        peek
        expanded={open}
        onExpandedChange={setOpen}
        action={<button type="button">Add</button>}
      >
        <p>Inside</p>
      </Sheet>
    );
  }

  it("names the grip, and holds the title and its count in a button inside an h2", () => {
    render(<Gripped />);
    const grip = screen.getByRole("button", { name: "Show everything" });
    const title = screen.getByRole("button", { name: /^What's inside\s*8$/ });
    expect(grip.getAttribute("aria-expanded")).toBe("false");
    expect(title.getAttribute("aria-expanded")).toBe("false");
    expect(title.parentElement?.tagName).toBe("H2");
    expect(screen.getByRole("heading", { level: 2 }).contains(title)).toBe(true);
    expect(grip.getAttribute("aria-controls")).toBe(title.getAttribute("aria-controls"));
    expect(screen.getByRole("region").getAttribute("data-grip")).toBe("button");
  });

  it("opens from either, and the action stays beside them", () => {
    render(<Gripped />);
    fireEvent.click(screen.getByRole("button", { name: "Show everything" }));
    expect(
      screen.getByRole("button", { name: /^What's inside\s*8$/ }).getAttribute("aria-expanded"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^What's inside\s*8$/ }));
    expect(
      screen.getByRole("button", { name: "Show everything" }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.getByRole("button", { name: "Add" }).closest("[inert]")).toBeNull();
  });

  it("gives the focus back to the title's button when Escape folds it", () => {
    render(<Gripped />);
    fireEvent.click(screen.getByRole("button", { name: "Show everything" }));
    const inside = screen.getByRole("button", { name: "Add" });
    inside.focus();
    fireEvent.keyDown(inside, { key: "Escape" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /^What's inside\s*8$/ }),
    );
  });
});

describe("Sheet, legacy look", () => {
  it("keeps the old classes for the screens not rebuilt yet", () => {
    render(
      <Sheet legacy label="Sheet" title="List" expanded={false} onExpandedChange={() => undefined}>
        <p>Inside</p>
      </Sheet>,
    );
    expect(screen.getByRole("region").classList.contains("pf-sheet")).toBe(true);
    expect(
      screen.getByRole("button", { name: "List" }).classList.contains("pf-sheet__handle"),
    ).toBe(true);
  });
});

describe("the sheet's styles", () => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");

  /** The text between the braces that open at `open`, braces inside included. */
  function blockAt(open: number): string {
    let depth = 0;
    for (let i = open; i < stripped.length; i++) {
      depth += stripped[i] === "{" ? 1 : stripped[i] === "}" ? -1 : 0;
      if (depth === 0) {
        return stripped.slice(open + 1, i);
      }
    }
    return "";
  }

  /** Every rule as [selector list, body], whatever block it sits in. */
  function rulesIn(source: string): [string[], string][] {
    return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel = "", body = ""]) => [
      sel
        .replace(/@media[^{]*\{/, "")
        .split(",")
        .map((x) => x.trim()),
      body,
    ]);
  }

  const rule = (selector: string): string =>
    rulesIn(stripped).find(([sel]) => sel.includes(selector))?.[1] ?? "";

  it("draws the phone sheet: radius 22 22 0 0, the peek shadow, 196 px of peek", () => {
    const body = rule(".k-sheet");
    expect(body).toMatch(/border-radius:\s*var\(--r-dialog\) var\(--r-dialog\) 0 0/);
    expect(body).toMatch(/box-shadow:\s*var\(--shadow-peek\)/);
    expect(rule('.k-sheet[data-peek="true"]')).toMatch(/height:\s*var\(--sheet-peek\)/);
  });

  it("spaces the head as MobileWorkspace does: 4 px under the grip and the head, 8 px below", () => {
    const sheet = rule('.k-sheet[data-grip="button"]');
    expect(sheet).toMatch(/gap:\s*var\(--s-4\)/);
    expect(sheet).toMatch(/padding-top:\s*calc\(var\(--control-h\) \+ var\(--s-4\)\)/);
    expect(sheet).toMatch(/padding-bottom:\s*var\(--s-8\)/);
  });

  it("draws a 40 by 5 handle in the handle colour", () => {
    const grip = rule(".k-sheet__grip::after");
    expect(grip).toMatch(/width:\s*40px/);
    expect(grip).toMatch(/height:\s*5px/);
    expect(grip).toMatch(/background:\s*var\(--handle\)/);
  });

  it("gives the handle a 44 px target", () => {
    expect(rule(".k-sheet__handle")).toMatch(/min-height:\s*var\(--control-h\)/);
    expect(rule(".k-sheet__grip")).toMatch(/height:\s*var\(--control-h\)/);
  });

  it("fills the screen below 600 px when it holds an editor", () => {
    const at = stripped.indexOf("@media (width < 600px)");
    expect(at).toBeGreaterThan(-1);
    const block = blockAt(stripped.indexOf("{", at));
    const body = rulesIn(block).find(([sel]) =>
      sel.includes('.k-sheet[data-full="true"][data-expanded="true"]'),
    )?.[1];
    expect(body).toMatch(/inset:\s*0/);
    expect(body).toMatch(/height:\s*100dvh/);
  });

  it("turns off every transition the sheet has when the person asks for less motion", () => {
    const at = stripped.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(at).toBeGreaterThan(-1);
    const reducedBody = blockAt(stripped.indexOf("{", at));
    const reduced = new Set(
      rulesIn(reducedBody)
        .filter(([, body]) => /transition:\s*none/.test(body))
        .flatMap(([sel]) => sel),
    );
    const outside = stripped.slice(0, at) + stripped.slice(at + reducedBody.length);
    const animated = rulesIn(outside)
      .filter(([, body]) => /transition:\s*(?!none)/.test(body))
      .flatMap(([sel]) => sel)
      .filter((sel) => sel.includes(".k-sheet"));
    expect(animated.length).toBeGreaterThanOrEqual(2);
    for (const sel of animated) {
      expect(reduced.has(sel), sel).toBe(true);
    }
  });
});
