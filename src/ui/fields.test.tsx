// src/ui/fields.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STALE_CODE } from "../app/state";
import { CheckField, SelectField, TextField } from "./fields";
import { Notices } from "./Notices";

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

  it("renders nothing without notices", () => {
    const { container } = render(<Notices notices={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
