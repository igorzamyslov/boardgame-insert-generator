// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { Mesh as ThreeMesh } from "three";
import type { BufferGeometry } from "three";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { modelXmlChunks, num, to3mf, xmlAttr } from "./threemf";
import { cubeMesh } from "../geometry/test-mesh";
import type { Mesh } from "../geometry/types";

const tetra: Mesh = {
  positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
};

function meshes(bytes: Uint8Array): ThreeMesh[] {
  const group = new ThreeMFLoader().parse(bytes.slice().buffer);
  group.updateMatrixWorld(true);
  const found: ThreeMesh[] = [];
  group.traverse((o) => {
    if (o instanceof ThreeMesh) {
      found.push(o);
    }
  });
  return found;
}

describe("num and xmlAttr", () => {
  it("formats with toFixed, no trailing zeros, no -0", () => {
    expect(num(1)).toBe("1");
    expect(num(0.1 + 0.2)).toBe("0.3");
    expect(num(-0.00001)).toBe("0");
    expect(num(123.456789)).toBe("123.4568");
    expect(num(1e-7)).toBe("0");
  });

  it("escapes markup and drops control characters", () => {
    expect(xmlAttr(`a<b>&"c'\u0001`)).toBe("a&lt;b&gt;&amp;&quot;c&apos;");
  });
});

describe("to3mf", () => {
  it("writes the exact model XML", () => {
    const xml = [
      ...modelXmlChunks([{ name: "Tetra & co", mesh: tetra, transform: [5, 6.5, 0] }]),
    ].join("");
    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
        " <resources>",
        '  <object id="1" type="model" name="Tetra &amp; co">',
        "   <mesh>",
        "    <vertices>",
        '     <vertex x="0" y="0" z="0"/>',
        '     <vertex x="10" y="0" z="0"/>',
        '     <vertex x="0" y="10" z="0"/>',
        '     <vertex x="0" y="0" z="10"/>',
        "    </vertices>",
        "    <triangles>",
        '     <triangle v1="0" v2="2" v3="1"/>',
        '     <triangle v1="0" v2="1" v3="3"/>',
        '     <triangle v1="0" v2="3" v3="2"/>',
        '     <triangle v1="1" v2="2" v3="3"/>',
        "    </triangles>",
        "   </mesh>",
        "  </object>",
        " </resources>",
        " <build>",
        '  <item objectid="1" transform="1 0 0 0 1 0 0 0 1 5 6.5 0"/>',
        " </build>",
        "</model>",
        "",
      ].join("\n"),
    );
  });

  it("packages content types, relationships and the model", () => {
    const files = unzipSync(to3mf([{ name: "a", mesh: tetra }]));
    expect(Object.keys(files).sort()).toEqual([
      "3D/3dmodel.model",
      "[Content_Types].xml",
      "_rels/.rels",
    ]);
    const types = strFromU8(files["[Content_Types].xml"] ?? new Uint8Array());
    expect(types).toContain(
      'Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"',
    );
    expect(types).toContain(
      'Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"',
    );
    const rels = strFromU8(files["_rels/.rels"] ?? new Uint8Array());
    expect(rels).toContain('Target="/3D/3dmodel.model"');
    expect(rels).toContain('Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"');
    const model = strFromU8(files["3D/3dmodel.model"] ?? new Uint8Array());
    expect(model).toContain('unit="millimeter"');
    expect(model).not.toContain("transform=");
  });

  it("re-parses with three's 3MFLoader: objects, names, counts", () => {
    const bytes = to3mf([
      { name: "01 Cards", mesh: cubeMesh(10), transform: [0, 0, 0] },
      { name: "02 Bits", mesh: tetra, transform: [20, 0, 0] },
    ]);
    const found = meshes(bytes);
    expect(found.map((m) => m.name).sort()).toEqual(["01 Cards", "02 Bits"]);
    const cube = found.find((m) => m.name === "01 Cards");
    const geometry = cube?.geometry as BufferGeometry;
    expect(geometry.index?.count ?? geometry.getAttribute("position").count).toBe(36);
    const bits = found.find((m) => m.name === "02 Bits");
    expect(bits?.matrixWorld.elements[12]).toBe(20);
  });

  it("is deterministic", () => {
    expect(to3mf([{ name: "a", mesh: tetra }])).toEqual(to3mf([{ name: "a", mesh: tetra }]));
  });

  it("handles many parts", () => {
    const parts = Array.from({ length: 200 }, (_, i) => ({ name: `part ${i}`, mesh: cubeMesh(5) }));
    const files = unzipSync(to3mf(parts));
    const model = strFromU8(files["3D/3dmodel.model"] ?? new Uint8Array());
    expect(model.match(/<object /g)).toHaveLength(200);
    expect(model.match(/<item /g)).toHaveLength(200);
  });

  it("escapes a name with markup characters and emoji, and the loader reads it back", () => {
    const name = `A & B < C > "D" 'E' 🎲`;
    const files = unzipSync(to3mf([{ name, mesh: tetra }]));
    const model = strFromU8(files["3D/3dmodel.model"] ?? new Uint8Array());
    expect(model).toContain('name="A &amp; B &lt; C &gt; &quot;D&quot; &apos;E&apos; 🎲"');
    const found = meshes(to3mf([{ name, mesh: tetra }]));
    expect(found.map((m) => m.name)).toEqual([name]);
  });
});
