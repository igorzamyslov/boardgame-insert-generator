// src/kit/SearchField.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchField } from "./SearchField";

afterEach(cleanup);

describe("SearchField", () => {
  it("is a search box named by its label, with a placeholder", () => {
    const { container } = render(
      <SearchField
        label="Find a setting"
        placeholder="Find a setting, like floor or lip"
        value=""
        onInput={() => undefined}
      />,
    );
    const input = screen.getByRole("searchbox", { name: "Find a setting" });
    expect(input.getAttribute("placeholder")).toBe("Find a setting, like floor or lip");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("reports what is typed", () => {
    const onInput = vi.fn();
    render(<SearchField label="Find a setting" value="" onInput={onInput} />);
    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "floor" } });
    expect(onInput).toHaveBeenCalledWith("floor");
  });
});
