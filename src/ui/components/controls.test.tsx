// src/ui/components/controls.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Notice } from "../../model/types";
import { LENGTH } from "../limits";
import { ValidationContext } from "../validation";
import { CountField, ExactRow, NumField, TextBox, TitleInput } from "./controls";
import { of } from "./test-editors";
import { SettingsGroup } from "./TraySettings";

afterEach(cleanup);

const error = (path: string, message: string): Notice => ({
  level: "error",
  code: "field.test",
  path,
  message,
});

describe("NumField", () => {
  it("commits what is typed when the rules allow it, and says why when they do not", () => {
    const onCommit = vi.fn();
    render(<NumField id="w" label="Width mm" value={20} {...LENGTH} onCommit={onCommit} />);
    fireEvent.input(screen.getByLabelText("Width mm"), { target: { value: "25,5" } });
    expect(onCommit).toHaveBeenLastCalledWith(25.5);
    fireEvent.input(screen.getByLabelText("Width mm"), { target: { value: "0" } });
    expect(screen.getByRole("alert").textContent).toBe("Must be more than 0.");
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("shows the engine's message at its path, and its warnings as plain notes", () => {
    render(
      <ValidationContext.Provider
        value={[
          error("/w", "Too wide."),
          { level: "warning", code: "x", path: "/w", message: "Careful." },
        ]}
      >
        <NumField id="w" label="Width mm" value={20} path="/w" {...LENGTH} onCommit={vi.fn()} />
      </ValidationContext.Provider>,
    );
    expect(screen.getByRole("alert").textContent).toBe("Too wide.");
    expect(screen.getByText("Careful.")).toBeTruthy();
    expect(screen.getByLabelText("Width mm").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("TextBox", () => {
  it("commits on blur when asked to, trimmed, and not when nothing changed", () => {
    const onCommit = vi.fn();
    render(
      <TextBox
        id="g"
        label="Group"
        value="g"
        commitOn="blur"
        normalize={(v) => v.trim()}
        onCommit={onCommit}
      />,
    );
    const box = screen.getByLabelText("Group") as HTMLInputElement;
    fireEvent.input(box, { target: { value: "g " } });
    fireEvent.blur(box);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.input(box, { target: { value: " tokens " } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("tokens");
  });
});

describe("TitleInput", () => {
  it("is named for assistive technology and commits every keystroke", () => {
    const onCommit = vi.fn();
    render(<TitleInput label="Name" value="Market deck" onCommit={onCommit} />);
    fireEvent.input(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Market" } });
    expect(onCommit).toHaveBeenCalledWith("Market");
  });
});

describe("CountField", () => {
  it("asks its question over a stepper that cannot go below one", () => {
    const onChange = vi.fn();
    render(
      <CountField label="How many cards?" name="Number of cards" value={1} onChange={onChange} />,
    );
    expect(screen.getByText("How many cards?")).toBeTruthy();
    const fewer = screen.getByRole("button", { name: "Fewer" });
    expect(fewer.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(fewer);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});

describe("ExactRow", () => {
  it("is no disclosure: its name, its control, its hint and nothing to press to see them", () => {
    render(
      <ExactRow title="Sleeve size" hint="Under the card.">
        <p>Inside</p>
      </ExactRow>,
    );
    expect(screen.getByText("Sleeve size")).toBeTruthy();
    expect(screen.getByText("Inside")).toBeTruthy();
    expect(screen.getByText("Under the card.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the way back under the control only while the value differs, and it puts it back", () => {
    const onBack = vi.fn();
    const view = render(
      <ExactRow title="Copies" revert={{ to: "1", onBack }}>
        <p>Inside</p>
      </ExactRow>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to 1 for Copies" }));
    expect(onBack).toHaveBeenCalledOnce();
    view.rerender(
      <ExactRow title="Copies">
        <p>Inside</p>
      </ExactRow>,
    );
    expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
  });

  it("blocked: its name and the reason, no control and no button", () => {
    render(
      <ExactRow title="Spacer plates" blockedReason="Spacer plates need room for more cards.">
        <p>Inside</p>
      </ExactRow>,
    );
    expect(screen.getByText("Spacer plates")).toBeTruthy();
    expect(screen.getByText("Spacer plates need room for more cards.")).toBeTruthy();
    expect(screen.queryByText("Inside")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("SettingsGroup", () => {
  const c = of("custom");

  it("opens in place on a press, with its values under it", () => {
    render(
      <SettingsGroup id="shape" component={c}>
        <p>Inside</p>
      </SettingsGroup>,
    );
    const row = screen.getByRole("button", { name: /^Shape/ });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Inside")).toBeNull();
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Inside")).toBeTruthy();
    fireEvent.click(row);
    expect(screen.queryByText("Inside")).toBeNull();
  });

  it("opens by itself for an error at one of its paths, and stays open when it is mended", () => {
    const group = (
      <SettingsGroup id="copies" component={c} errorPaths={["/components/0/copies"]}>
        <p>Inside</p>
      </SettingsGroup>
    );
    const view = render(group);
    const row = () => screen.getByRole("button", { name: /^Copies and group/ });
    expect(row().getAttribute("aria-expanded")).toBe("false");
    view.rerender(
      <ValidationContext.Provider value={[error("/components/0/copies", "Bad.")]}>
        {group}
      </ValidationContext.Provider>,
    );
    expect(row().getAttribute("aria-expanded")).toBe("true");
    view.rerender(<ValidationContext.Provider value={[]}>{group}</ValidationContext.Provider>);
    expect(row().getAttribute("aria-expanded")).toBe("true");
    // another component's error opens nothing
    cleanup();
    render(
      <ValidationContext.Provider value={[error("/components/3/copies", "Bad.")]}>
        {group}
      </ValidationContext.Provider>,
    );
    expect(row().getAttribute("aria-expanded")).toBe("false");
  });

  it("says what it holds in a line, and how many options inside differ from their default", () => {
    render(
      <SettingsGroup id="reach" component={{ ...c, access: "setup" }}>
        <p>Inside</p>
      </SettingsGroup>,
    );
    const row = screen.getByRole("button", { name: /^Reach/ });
    expect(row.textContent).toContain("Only at setup");
    expect(row.textContent).toContain("1 changed");
  });
});
