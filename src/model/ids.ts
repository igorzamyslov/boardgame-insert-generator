const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Bytes at or above 252 (= 7 × 36) are rejected: they would make '0'–'3' more
 * likely than the rest of the alphabet when taken modulo 36.
 */
const LIMIT = 252;

/** 8 random base36 characters, for project and component ids. */
export function newId(): string {
  let id = "";
  while (id.length < 8) {
    for (const b of crypto.getRandomValues(new Uint8Array(8))) {
      if (b < LIMIT && id.length < 8) {
        id += ALPHABET.charAt(b % 36);
      }
    }
  }
  return id;
}
