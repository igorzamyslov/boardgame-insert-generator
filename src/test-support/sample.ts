import { DEFAULT_SETTINGS } from "../model/settings";
import type { Project } from "../model/types";
import { APP_VERSION, SCHEMA_VERSION } from "../model/version";

/**
 * A deterministic project that uses every component kind, every optional
 * component field, a group, copies, the lock kinds a 0.1 file has (position, size, stack) and a
 * stored layout. Test-only. The turn lock and flat decks are in test/fixtures/schema/0.2.0.json.
 */
export function sampleProject(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdWith: APP_VERSION,
    id: "sample01",
    name: "Sample",
    box: {
      innerWidth: 290,
      innerDepth: 290,
      innerHeight: 70,
      headroom: 8,
      headroomCoverage: "partial",
      storedOnSide: false,
    },
    printer: { bedX: 256, bedY: 256, bedZ: 256, bedMargin: 5, layerHeight: 0.2 },
    settings: structuredClone(DEFAULT_SETTINGS),
    components: [
      {
        id: "cards001",
        name: "Main deck",
        access: "often",
        kind: "cards",
        shortSide: 63.5,
        longSide: 88,
        decks: [
          { name: "Action", count: 60 },
          { name: "Event", count: 40 },
        ],
        sleeve: "standard",
        thickness: { mode: "preset" },
        storage: "auto",
      },
      {
        id: "cards002",
        name: "Big cards",
        access: "setup",
        kind: "cards",
        shortSide: 70,
        longSide: 120,
        decks: [{ name: "Scenario", count: 12 }],
        sleeve: { w: 73, h: 123, thickness: 0.15 },
        thickness: { mode: "measured", cards: 12, stackMm: 5.4 },
        storage: "flat",
        clearance: 2,
      },
      {
        id: "bulk0001",
        name: "Player bits",
        access: "sometimes",
        kind: "bulk",
        copies: 4,
        items: [
          { name: "Meeple", count: 5, w: 16, d: 10, h: 16 },
          { name: "Score marker", volumeMl: 20 },
        ],
      },
      {
        id: "tiles001",
        name: "Map tiles",
        access: "setup",
        kind: "tiles",
        shape: { type: "hex", flatToFlat: 40, orientation: "pointy" },
        thickness: 2,
        count: 60,
        storage: "auto",
      },
      {
        id: "minis001",
        name: "Heroes",
        access: "sometimes",
        kind: "minis",
        figures: [
          { name: "Knight", w: 25, d: 25, h: 45, count: 2 },
          { name: "Dragon", w: 60, d: 50, h: 70, count: 1 },
        ],
        storage: "pockets",
      },
      {
        id: "custom01",
        name: "Score pad",
        access: "setup",
        kind: "custom",
        w: 100,
        d: 70,
        h: 10,
        count: 1,
      },
    ],
    groups: [
      {
        id: "setup",
        name: "Setup",
        access: "setup",
        memberIds: ["cards002", "tiles001"],
      },
    ],
    locks: [
      { kind: "position", trayKey: "cards001:p0:0", path: "01", rotated: true },
      { kind: "size", trayKey: "minis001:p0:0", w: 120, d: 80, h: 61.8 },
      { kind: "stack", trayKeys: ["setup:p0:0", "cards001:p0:0"] },
    ],
    layout: {
      createdWith: APP_VERSION,
      geometryVersion: "0.1.0",
      inputsHash: "00000000000000",
      seed: 42,
      iterations: 3000,
      capped: false,
      trays: [
        {
          key: "custom01:p0:0",
          part: "tray",
          path: "1",
          stack: 0,
          level: 0,
          x: 0,
          y: 0,
          z: 0,
          w: 104,
          d: 74,
          h: 62,
          rotated: false,
          wall: 1.6,
          floor: 1.2,
          lip: false,
          solid: false,
          compartments: [
            {
              x: 1.6,
              y: 1.6,
              w: 100.8,
              d: 70.8,
              floorZ: 50,
              kind: "well",
              contents: "Score pad",
              features: [
                { type: "wallCutout", side: "front", at: 52, width: 25, depth: 12, floorNotch: 0 },
                { type: "cornerRelief", d: 3 },
              ],
            },
          ],
        },
      ],
    },
  };
}
