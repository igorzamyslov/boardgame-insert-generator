import { zipSync } from "fflate";
import type { Zippable } from "fflate";

// Fixed timestamp (local time, as zip stores it) so equal inputs give
// byte-identical archives.
const ZIP_TIME = new Date(2020, 0, 1, 0, 0, 0);

// Zip archive of the given files. Already-compressed .3mf files are stored;
// everything else is deflated. Names must be unique.
export function zipFiles(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const entries: Zippable = {};
  for (const { name, data } of files) {
    if (name in entries) {
      throw new RangeError(`Duplicate file name in zip: ${name}`);
    }
    entries[name] = [data, { level: name.endsWith(".3mf") ? 0 : 6, mtime: ZIP_TIME }];
  }
  return zipSync(entries);
}
