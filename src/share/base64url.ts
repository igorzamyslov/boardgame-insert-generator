const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const DECODE = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) {
  DECODE[ALPHABET.charCodeAt(i)] = i;
}

/** True for a single character of the base64url alphabet (no padding). */
export function isBase64UrlChar(char: string | undefined): boolean {
  if (char === undefined || char.length !== 1) {
    return false;
  }
  const code = char.charCodeAt(0);
  return code < 128 && (DECODE[code] ?? -1) >= 0;
}

/** RFC 4648 §5 base64url without padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let k = 0; k < chars; k++) {
      out += ALPHABET.charAt((n >> (18 - 6 * k)) & 63);
    }
  }
  return out;
}

/** Inverse of toBase64Url. Null on any character outside the alphabet or an impossible length. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) {
    return null;
  }
  const out = new Uint8Array(Math.floor((text.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const v = code < 128 ? (DECODE[code] ?? -1) : -1;
    if (v < 0) {
      return null;
    }
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}
