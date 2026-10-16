// src/test-support/link.ts
// Test-only: the app no longer writes `#1.` links, but old ones still open, so tests build them here.
import { deflateSync, strToU8 } from "fflate";
import { serializeProject } from "../model/schema";
import type { ForeignData, Project } from "../model/types";
import { toBase64Url } from "../share/base64url";
import { HASH_FORMAT } from "../share/link";

/** `#1.<base64url(deflate(json))>`, the format an old shared link has. */
export function encodeHash(p: Project, foreign: ForeignData): string {
  const deflated = deflateSync(strToU8(serializeProject(p, foreign)), { level: 9 });
  return `#${HASH_FORMAT}.${toBase64Url(deflated)}`;
}
