const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** 8 random base36 characters, for project and component ids. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let id = "";
  for (const b of bytes) {
    id += ALPHABET.charAt(b % 36);
  }
  return id;
}
