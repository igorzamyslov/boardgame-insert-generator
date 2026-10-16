// src/ui/BottomSheet.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import css from "../style.css?raw";
import { BottomSheet } from "./BottomSheet";

afterEach(cleanup);

function Harness(p: { start?: boolean; full?: boolean; onChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(p.start ?? false);
  return (
    <>
      <button type="button">Elsewhere</button>
      <BottomSheet
        label="The box and what's inside"
        title="What's inside"
        meta="3 items"
        expanded={open}
        full={p.full}
        onExpandedChange={(next) => {
          p.onChange?.(next);
          setOpen(next);
        }}
      >
        <button type="button">First control</button>
        <button type="button">Second control</button>
      </BottomSheet>
    </>
  );
}

const handle = (): HTMLElement => screen.getByRole("button", { name: /What's inside/ });

describe("BottomSheet", () => {
  it("is a named region whose handle is a button that says whether it is open", () => {
    render(<Harness />);
    expect(screen.getByRole("region", { name: "The box and what's inside" })).toBeTruthy();
    expect(handle().tagName).toBe("BUTTON");
    expect(handle().getAttribute("aria-expanded")).toBe("false");
    expect(handle().textContent).toContain("3 items");
    fireEvent.click(handle());
    expect(handle().getAttribute("aria-expanded")).toBe("true");
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
          <BottomSheet label="Sheet" title="List" expanded={open} onExpandedChange={setOpen}>
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
          </BottomSheet>
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
      <BottomSheet
        label="Sheet"
        title="List"
        expanded={false}
        onExpandedChange={() => undefined}
        action={<button type="button">Keep searching</button>}
      >
        <p>Inside</p>
      </BottomSheet>,
    );
    const action = screen.getByRole("button", { name: "Keep searching" });
    expect(action.closest("[inert]")).toBeNull();
    expect(action.parentElement).toBe(screen.getByRole("button", { name: "List" }).parentElement);
  });

  it("marks the editor, and hands its handle to the owner", () => {
    const handleRef = { current: null as HTMLButtonElement | null };
    render(
      <BottomSheet
        label="Sheet"
        title="List"
        expanded
        editing
        handleRef={handleRef}
        onExpandedChange={() => undefined}
      >
        <p>Inside</p>
      </BottomSheet>,
    );
    expect(screen.getByRole("region").getAttribute("data-editing")).toBe("true");
    expect(handleRef.current).toBe(screen.getByRole("button", { name: "List" }));
  });

  it("marks a sheet that fills the screen", () => {
    render(<Harness start full />);
    expect(screen.getByRole("region").getAttribute("data-full")).toBe("true");
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

  it("gives the handle a 44 px target", () => {
    const body = rulesIn(stripped).find(([sel]) => sel.includes(".pf-sheet__handle"))?.[1];
    expect(body).toMatch(/min-height:\s*var\(--control-h\)/);
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
      .filter((sel) => sel.includes(".pf-sheet"));
    expect(animated.length).toBeGreaterThanOrEqual(3);
    for (const sel of animated) {
      expect(reduced.has(sel), sel).toBe(true);
    }
  });
});
