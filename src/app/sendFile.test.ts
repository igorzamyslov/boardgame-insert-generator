// src/app/sendFile.test.ts
import { describe, expect, it, vi } from "vitest";
import { shareFileVia } from "./sendFile";

const file = new File(["{}"], "game.insert.json", { type: "application/json" });

describe("shareFileVia", () => {
  it("hands the file to the share sheet when it can take files", async () => {
    const share = vi.fn(() => Promise.resolve());
    const canShare = vi.fn(() => true);
    expect(await shareFileVia({ canShare, share }, file)).toBe("shared");
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(share).toHaveBeenCalledWith({ files: [file] });
  });

  it("is unsupported without share or when the sheet refuses files", async () => {
    expect(await shareFileVia({}, file)).toBe("unsupported");
    const share = vi.fn(() => Promise.resolve());
    expect(await shareFileVia({ canShare: () => false, share }, file)).toBe("unsupported");
    expect(await shareFileVia({ share }, file)).toBe("unsupported");
    expect(share).not.toHaveBeenCalled();
  });

  it("reports a dismissed sheet as cancelled, and any other failure as unsupported", async () => {
    const abort = (): Promise<void> => Promise.reject(new DOMException("no", "AbortError"));
    expect(await shareFileVia({ canShare: () => true, share: abort }, file)).toBe("cancelled");
    const broken = (): Promise<void> => Promise.reject(new Error("boom"));
    expect(await shareFileVia({ canShare: () => true, share: broken }, file)).toBe("unsupported");
  });
});
