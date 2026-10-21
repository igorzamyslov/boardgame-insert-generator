// src/test-support/preact-effects.setup.ts
// Vitest setup file, run before every test file (see `setupFiles` in vite.config.ts).
//
// Preact 11 defers the cleanup of a passive effect (`useEffect`) of an unmounted component to
// its after-paint flush: a requestAnimationFrame, or a 35 ms timer if that never comes. The
// testing library's `cleanup()` unmounts outside `act`, so it only queues those cleanups. When a
// test file ends first (a short file on a busy CI runner) its jsdom is gone by the time the timer
// fires, and a cleanup that touches `document` or `window` throws "document is not defined",
// which vitest reports as an unhandled error and fails the whole run.
//
// After every test: unmount whatever is left, then flush Preact's after-paint queues inside
// `act`, so every pending cleanup and effect runs now, while the page still exists.
import { afterEach } from "vitest";

// Only the jsdom test files have a page to flush; the Node ones skip the imports.
if (typeof document !== "undefined") {
  const { act, cleanup } = await import("@testing-library/preact");
  const { h, render } = await import("preact");
  const { useEffect } = await import("preact/hooks");

  // `act` flushes the after-paint queues only when something is scheduled inside it, and the
  // queues are shared by every root, so a component with an effect gets the flush started.
  const Flush = () => {
    useEffect(() => undefined);
    return null;
  };

  afterEach(() => {
    cleanup();
    const host = document.createElement("div");
    void act(() => {
      render(h(Flush, null), host);
    });
    render(null, host);
  });
}
