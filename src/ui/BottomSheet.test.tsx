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

  it("marks a sheet that fills the screen", () => {
    render(<Harness start full />);
    expect(screen.getByRole("region").getAttribute("data-full")).toBe("true");
  });
});

describe("the sheet's styles", () => {
  const rule = (selector: string): string => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g);
    return [...rules]
      .filter(([, sel = ""]) => sel.split(",").some((s) => s.trim() === selector))
      .map(([, , body = ""]) => body)
      .join("\n");
  };

  it("gives the handle a 44 px target", () => {
    expect(rule(".pf-sheet__handle")).toMatch(/min-height:\s*var\(--control-h\)/);
  });

  it("stops moving when the person asks for less motion", () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1];
    expect(reduced).toMatch(/\.pf-sheet\b[^{]*\{[^}]*transition:\s*none/);
  });
});
