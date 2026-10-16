// src/app/sendFile.ts
/** What "Send file" did: the share sheet took the file, the person dismissed it, or it can't be used here. */
export type SendResult = "shared" | "cancelled" | "unsupported";

/** Puts a file into the share sheet; the app's `share` prop is this by default and tests replace it. */
export type ShareFile = (file: File) => Promise<SendResult>;

/** The part of `navigator` the share sheet needs (both are missing in older browsers and on desktops). */
export interface ShareApi {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}

/**
 * Shares `file` with `navigator.share({ files })` when the browser says it can share files.
 * Anything else (no share sheet, no file support, a failure that isn't the person closing the
 * sheet) is "unsupported", so the caller saves the file instead.
 */
export async function shareFileVia(api: ShareApi, file: File): Promise<SendResult> {
  const data = { files: [file] };
  if (typeof api.share !== "function" || typeof api.canShare !== "function") {
    return "unsupported";
  }
  try {
    if (!api.canShare(data)) {
      return "unsupported";
    }
    await api.share(data);
    return "shared";
  } catch (e) {
    return e instanceof DOMException && e.name === "AbortError" ? "cancelled" : "unsupported";
  }
}

export const shareFile: ShareFile = (file) => shareFileVia(navigator, file);
