// src/app/download.ts
/** Save a Blob through a temporary <a download>. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `slice()` copies into a plain ArrayBuffer-backed array, which Blob accepts. */
export function bytesToBlob(data: Uint8Array, type: string): Blob {
  return new Blob([data.slice()], { type });
}

const MAX_SLUG_LENGTH = 80;
/** Device names Windows refuses as a file name, with or without an extension. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/** A file-name-safe version of a project name: accents dropped to their base letters
 * ("Würfelkönig" → "Wurfelkonig"), anything else unsafe to "-", at most 80 characters. */
export function fileSlug(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/[-.]+$/, "");
  if (slug === "") {
    return "insert";
  }
  return WINDOWS_RESERVED.test(slug) ? `${slug}-insert` : slug;
}
