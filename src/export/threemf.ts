import { Zip, ZipDeflate, strToU8 } from "fflate";
import type { Mesh } from "../geometry/types";

export interface ThreeMfPart {
  name: string;
  mesh: Mesh;
  transform?: [number, number, number];
}

// Fixed timestamp (local time, as zip stores it) so equal inputs give
// byte-identical files.
const ZIP_TIME = new Date(2020, 0, 1, 0, 0, 0);

export const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`;

export const RELS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

// Fixed-point via toFixed (never locale-formatted), no trailing zeros, no "-0".
export function num(n: number): string {
  const s = Number(n.toFixed(4)).toString();
  return s === "-0" ? "0" : s;
}

// Characters XML 1.0 allows: tab, LF, CR, U+0020 and up except U+FFFE/U+FFFF.
function xmlAllowed(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c !== 0xfffe && c !== 0xffff);
}

// XML attribute value: drops characters XML 1.0 forbids, escapes markup.
export function xmlAttr(text: string): string {
  return [...text]
    .filter(xmlAllowed)
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function objectXml(id: number, part: ThreeMfPart): string {
  const lines = [
    `  <object id="${id}" type="model" name="${xmlAttr(part.name)}">`,
    "   <mesh>",
    "    <vertices>",
  ];
  const p = part.mesh.positions;
  for (let i = 0; i + 2 < p.length; i += 3) {
    lines.push(
      `     <vertex x="${num(p[i] ?? 0)}" y="${num(p[i + 1] ?? 0)}" z="${num(p[i + 2] ?? 0)}"/>`,
    );
  }
  lines.push("    </vertices>", "    <triangles>");
  const ix = part.mesh.indices;
  for (let t = 0; t + 2 < ix.length; t += 3) {
    lines.push(`     <triangle v1="${ix[t] ?? 0}" v2="${ix[t + 1] ?? 0}" v3="${ix[t + 2] ?? 0}"/>`);
  }
  lines.push("    </triangles>", "   </mesh>", "  </object>", "");
  return lines.join("\n");
}

// 3D/3dmodel.model in chunks (one per object), so a large export never holds
// the whole XML as one string. Triangles keep manifold's winding (CCW seen
// from outside); each object gets one build item with an optional translation.
export function* modelXmlChunks(parts: ThreeMfPart[]): Generator<string> {
  yield [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    " <resources>",
    "",
  ].join("\n");
  for (const [i, part] of parts.entries()) {
    yield objectXml(i + 1, part);
  }
  const items = parts.map((part, i) => {
    const t = part.transform;
    const transform = t
      ? ` transform="1 0 0 0 1 0 0 0 1 ${num(t[0])} ${num(t[1])} ${num(t[2])}"`
      : "";
    return `  <item objectid="${i + 1}"${transform}/>`;
  });
  yield [" </resources>", " <build>", ...items, " </build>", "</model>", ""].join("\n");
}

function addFile(zip: Zip, name: string, chunks: Iterable<string>): void {
  const file = new ZipDeflate(name, { level: 6 });
  file.mtime = ZIP_TIME;
  zip.add(file);
  for (const chunk of chunks) {
    file.push(strToU8(chunk));
  }
  file.push(new Uint8Array(0), true);
}

// 3MF package (OPC zip): [Content_Types].xml, _rels/.rels → /3D/3dmodel.model,
// and the model with unit="millimeter".
export function to3mf(parts: ThreeMfPart[]): Uint8Array {
  const out: Uint8Array[] = [];
  const errors: Error[] = [];
  const zip = new Zip((err, data) => {
    if (err) {
      errors.push(err);
      return;
    }
    out.push(data);
  });
  addFile(zip, "[Content_Types].xml", [CONTENT_TYPES_XML]);
  addFile(zip, "_rels/.rels", [RELS_XML]);
  addFile(zip, "3D/3dmodel.model", modelXmlChunks(parts));
  zip.end();
  const [error] = errors;
  if (error) {
    throw error;
  }
  const total = out.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of out) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
