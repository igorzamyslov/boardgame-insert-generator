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

export function fileSlug(name: string): string {
  const slug = name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return slug === "" ? "insert" : slug;
}
