// src/app/link.ts
import { LINK_MAX_URL_CHARS } from "../share";
import { errorText } from "../util/errors";

export function shareLink(href: string, hash: string): string {
  const cut = href.indexOf("#");
  return `${cut >= 0 ? href.slice(0, cut) : href}${hash}`;
}

export type CopyLinkResult =
  | { status: "copied"; length: number; tooLong: boolean }
  | { status: "failed"; length: number; tooLong: boolean; link: string; error: string };

export async function copyLink(
  link: string,
  write: (text: string) => Promise<void>,
): Promise<CopyLinkResult> {
  const length = link.length;
  const tooLong = length > LINK_MAX_URL_CHARS;
  try {
    await write(link);
    return { status: "copied", length, tooLong };
  } catch (e) {
    return {
      status: "failed",
      length,
      tooLong,
      link,
      error: errorText(e),
    };
  }
}
