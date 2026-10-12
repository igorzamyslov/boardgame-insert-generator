// src/ui/fields.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STALE_CODE } from "../app/state";
import type { Notice } from "../model/types";
import { CheckField, SelectField, TextField } from "./fields";
import { Notices } from "./Notices";
import { ValidationContext } from "./validation";

afterEach(cleanup);

describe("TextField", () => {
  it("commits on input by default", () => {
    const onCommit = vi.fn();
    render(<TextField id="n" label="Name" value="A" onCommit={onCommit} />);
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "AB" } });
    expect(onCommit).toHaveBeenCalledWith("AB");
  });

  it("with commitOn blur keeps spaces while typing", () => {
    const onCommit = vi.fn();
    render(<TextField id="g" label="Group" value="" onCommit={onCommit} commitOn="blur" />);
    const el = screen.getByLabelText("Group");
    fireEvent.input(el, { target: { value: "big " } });
    expect(onCommit).not.toHaveBeenCalled();
    expect((el as HTMLInputElement).value).toBe("big ");
    fireEvent.input(el, { target: { value: "big tokens" } });
    fireEvent.blur(el);
    expect(onCommit).toHaveBeenCalledWith("big tokens");
  });

  it("normalises the text on blur and commits only a changed normalised value", () => {
    const onCommit = vi.fn();
    const trim = (s: string): string => s.trim();
    render(
      <TextField
        id="g"
        label="Group"
        value="g"
        onCommit={onCommit}
        commitOn="blur"
        normalize={trim}
      />,
    );
    const el = screen.getByLabelText("Group") as HTMLInputElement;
    fireEvent.input(el, { target: { value: "g " } });
    fireEvent.blur(el);
    expect(el.value).toBe("g");
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.input(el, { target: { value: " h " } });
    fireEvent.blur(el);
    expect(el.value).toBe("h");
    expect(onCommit).toHaveBeenCalledWith("h");
  });
});

describe("TextField commit keys and notices", () => {
  it("with commitOn blur, commits on Enter as well", () => {
    const onCommit = vi.fn();
    render(<TextField id="g" label="Group" value="" onCommit={onCommit} commitOn="blur" />);
    const el = screen.getByLabelText("Group");
    fireEvent.input(el, { target: { value: "tokens" } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(el, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("tokens");
  });

  it("flags only error notices as invalid", () => {
    render(
      <ValidationContext.Provider
        value={[{ level: "warning", code: "w", path: "/x", message: "Careful." }]}
      >
        <TextField id="g" label="Group" value="" onCommit={vi.fn()} path="/x" />
      </ValidationContext.Provider>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Group").getAttribute("aria-invalid")).toBe("false");
    expect(screen.getByText("Careful.")).toBeTruthy();
  });

  it("flags an error notice as invalid with an alert", () => {
    render(
      <ValidationContext.Provider
        value={[{ level: "error", code: "e", path: "/x", message: "Broken." }]}
      >
        <TextField id="g" label="Group" value="" onCommit={vi.fn()} path="/x" />
      </ValidationContext.Provider>,
    );
    expect(screen.getByRole("alert").textContent).toBe("Broken.");
    expect(screen.getByLabelText("Group").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("SelectField", () => {
  it("emits the typed option value", () => {
    const onChange = vi.fn();
    render(
      <SelectField
        id="fit"
        label="Fit"
        value="normal"
        options={[
          { value: "tight", label: "Tight" },
          { value: "normal", label: "Normal" },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Fit"), { target: { value: "tight" } });
    expect(onChange).toHaveBeenCalledWith("tight");
  });
});

describe("CheckField", () => {
  it("toggles and can be disabled with a hint", () => {
    const onChange = vi.fn();
    render(
      <CheckField
        id="side"
        label="Stored on its side"
        checked={false}
        onChange={onChange}
        hint="Upright on a shelf"
      />,
    );
    const box = screen.getByLabelText("Stored on its side");
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(box.getAttribute("aria-describedby")).toBe("side-hint");
  });

  it("shows only errors at its path as an alert tied to the checkbox, other levels as notes", () => {
    const notices: Notice[] = [
      { level: "error", code: "field.x", path: "/a", message: "Bad." },
      { level: "warning", code: "field.y", path: "/a", message: "Careful." },
    ];
    render(
      <ValidationContext.Provider value={notices}>
        <CheckField id="c" label="Thing" checked onChange={vi.fn()} path="/a" />
      </ValidationContext.Provider>,
    );
    const box = screen.getByLabelText("Thing");
    expect(screen.getByRole("alert").textContent).toBe("Bad.");
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(box.getAttribute("aria-describedby")).toBe("c-error c-notes");
    expect(screen.getByText("Careful.").getAttribute("role")).toBeNull();
  });
});

describe("Notices", () => {
  it("renders levels, alerts for errors, actions and dismiss buttons", () => {
    const onDismiss = vi.fn();
    render(
      <Notices
        notices={[
          { level: "error", code: "open.failed", message: "Broken link" },
          { level: "info", code: STALE_CODE, message: "Inputs changed" },
        ]}
        onDismiss={onDismiss}
        renderAction={(n) =>
          n.code === STALE_CODE ? <button type="button">Re-optimize</button> : null
        }
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Broken link");
    expect(screen.getByRole("button", { name: "Re-optimize" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Broken link" }));
    expect(onDismiss).toHaveBeenCalledWith("open.failed");
  });

  it("lists notices with the same code and message at different paths separately", () => {
    render(
      <Notices
        notices={[
          { level: "warning", code: "c", path: "/components/0", message: "Same text" },
          { level: "warning", code: "c", path: "/components/1", message: "Same text" },
        ]}
        renderAction={(n) => <span>{n.path}</span>}
      />,
    );
    expect(screen.getAllByText("Same text")).toHaveLength(2);
    expect(screen.getByText("/components/0")).toBeTruthy();
    expect(screen.getByText("/components/1")).toBeTruthy();
  });

  it("announces errors through role alert only, not also through a live region", () => {
    render(
      <Notices
        notices={[
          { level: "error", code: "e", message: "Broken" },
          { level: "info", code: "i", message: "Fyi" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Messages" });
    expect(list.hasAttribute("aria-live")).toBe(false);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("renders nothing without notices", () => {
    const { container } = render(<Notices notices={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
