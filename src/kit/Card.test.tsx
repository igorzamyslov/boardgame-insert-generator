// src/kit/Card.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Card } from "./Card";

afterEach(cleanup);

describe("Card", () => {
  it("holds what it is given", () => {
    const { container } = render(<Card>The box</Card>);
    expect(container.querySelector(".k-card")?.textContent).toBe("The box");
    expect(container.querySelector("button")).toBeNull();
  });

  it("is a button when it opens something", () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>The box 285 × 285 × 70 mm</Card>);
    fireEvent.click(screen.getByRole("button", { name: /The box/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
