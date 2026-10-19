// src/ui/components/controls.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Notice } from "../../model/types";
import { LENGTH } from "../limits";
import { ValidationContext } from "../validation";
import { CountField, ExactRow, NumField, TextBox, TitleInput } from "./controls";

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
  it("opens in place on a press, with its values under it", () => {
    render(
      <ExactRow title="Sleeve size">
        <p>Inside</p>
      </ExactRow>,
    );
    const row = screen.getByRole("button", { name: /Sleeve size/ });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Inside")).toBeNull();
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Inside")).toBeTruthy();
  });

  it("opens by itself for an error at one of its paths, and stays open when it is mended", () => {
    const view = render(
      <ExactRow title="Per player" errorPaths={["/components/0/copies"]}>
        <p>Inside</p>
      </ExactRow>,
    );
    const row = () => screen.getByRole("button", { name: /Per player/ });
    expect(row().getAttribute("aria-expanded")).toBe("false");
    view.rerender(
      <ValidationContext.Provider value={[error("/components/0/copies", "Bad.")]}>
        <ExactRow title="Per player" errorPaths={["/components/0/copies"]}>
          <p>Inside</p>
        </ExactRow>
      </ValidationContext.Provider>,
    );
    expect(row().getAttribute("aria-expanded")).toBe("true");
    view.rerender(
      <ValidationContext.Provider value={[]}>
        <ExactRow title="Per player" errorPaths={["/components/0/copies"]}>
          <p>Inside</p>
        </ExactRow>
      </ValidationContext.Provider>,
    );
    expect(row().getAttribute("aria-expanded")).toBe("true");
    // another component's error opens nothing
    cleanup();
    render(
      <ValidationContext.Provider value={[error("/components/3/copies", "Bad.")]}>
        <ExactRow title="Per player" errorPaths={["/components/0/copies"]}>
          <p>Inside</p>
        </ExactRow>
      </ValidationContext.Provider>,
    );
    expect(row().getAttribute("aria-expanded")).toBe("false");
  });
});
