// src/test-support/preact-effects.setup.test.tsx
// @vitest-environment jsdom
// preact-effects.setup.ts runs an unmounted component's effect cleanup before the next test, not
// 35 ms later on a timer that can outlive the test file's page.
import { render } from "@testing-library/preact";
import { useEffect } from "preact/hooks";
import { describe, expect, it } from "vitest";

const cleanups: string[] = [];

function Listening() {
  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      cleanups.push("keydown");
    };
  }, []);
  return <p>listening</p>;
}

function onKey() {
  /* only here so the cleanup has a listener to remove */
}

// The two tests depend on each other's order: the setup file's afterEach runs between them.
describe("the setup file flushes Preact's deferred effect cleanups", () => {
  it("leaves a mounted component behind for the setup file's afterEach to unmount", () => {
    render(<Listening />);
    expect(cleanups).toEqual([]);
  });

  it("ran that component's effect cleanup before this test started", () => {
    expect(cleanups).toEqual(["keydown"]);
  });
});
