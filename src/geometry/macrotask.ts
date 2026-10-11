// Resolves on a later task of the event loop, so messages that arrived in the
// meantime (a "cancel", say) are delivered first. A MessageChannel tick is
// used where there is one: setTimeout(0) is clamped to 4 ms once nested, which
// would add up over a queue of builds. The channel is a parameter so the
// fallback can be tested.
export function nextMacrotask(
  channel: typeof MessageChannel | undefined = globalThis.MessageChannel,
): Promise<void> {
  return new Promise((resolve) => {
    if (channel === undefined) {
      setTimeout(resolve, 0);
      return;
    }
    const { port1, port2 } = new channel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });
}
