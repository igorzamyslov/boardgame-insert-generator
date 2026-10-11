import type { Mesh } from "../geometry/types";

const HEADER_BYTES = 80;
const TRIANGLE_BYTES = 50;

// Printable ASCII only; never starts with "solid" (that would make some
// readers treat the binary file as ASCII STL).
function header(name: string): Uint8Array {
  const text = `insert-generator ${name}`.replace(/[^\x20-\x7e]/g, "_").slice(0, HEADER_BYTES);
  const bytes = new Uint8Array(HEADER_BYTES).fill(0x20);
  for (let i = 0; i < text.length; i += 1) {
    bytes[i] = text.charCodeAt(i);
  }
  return bytes;
}

// Binary STL: 80-byte header, uint32 triangle count, then per triangle the
// unit normal, three vertices (float32, little-endian) and a zero uint16.
export function toStl(mesh: Mesh, name: string): Uint8Array {
  const count = Math.floor(mesh.indices.length / 3);
  const out = new Uint8Array(HEADER_BYTES + 4 + count * TRIANGLE_BYTES);
  out.set(header(name), 0);
  const view = new DataView(out.buffer);
  view.setUint32(HEADER_BYTES, count, true);
  const p = mesh.positions;
  for (let t = 0; t < count; t += 1) {
    const corner = [0, 1, 2].map((k) => (mesh.indices[t * 3 + k] ?? 0) * 3);
    const [a = 0, b = 0, c = 0] = corner;
    const ux = (p[b] ?? 0) - (p[a] ?? 0);
    const uy = (p[b + 1] ?? 0) - (p[a + 1] ?? 0);
    const uz = (p[b + 2] ?? 0) - (p[a + 2] ?? 0);
    const vx = (p[c] ?? 0) - (p[a] ?? 0);
    const vy = (p[c + 1] ?? 0) - (p[a + 1] ?? 0);
    const vz = (p[c + 2] ?? 0) - (p[a + 2] ?? 0);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    let offset = HEADER_BYTES + 4 + t * TRIANGLE_BYTES;
    for (const value of [nx / len, ny / len, nz / len]) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
    for (const base of corner) {
      for (let k = 0; k < 3; k += 1) {
        view.setFloat32(offset, p[base + k] ?? 0, true);
        offset += 4;
      }
    }
    view.setUint16(offset, 0, true);
  }
  return out;
}
