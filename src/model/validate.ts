import type { Component, Lock, Notice, Project, Settings } from "./types";

/** Spec §5 bounds, applied to UI edits, URL input and files. */
export const BOUNDS: { maxComponents: 100; maxCount: 2000; maxLength: 1000; maxPlayers: 10 } = {
  maxComponents: 100,
  maxCount: 2000,
  maxLength: 1000,
  maxPlayers: 10,
};

/** 1000 mm × 1000 mm × 1000 mm, in ml. */
export const MAX_VOLUME_ML = 1_000_000;

/**
 * Notices that make a file or link unloadable: upper bounds (`limit.*`, they
 * protect the optimizer from absurd input) and corrupt structure
 * (`invalid.*`). Everything else (`field.*`) is shown next to the field and
 * the project still loads, so a half-edited autosave never locks the user out.
 */
export function isBlocking(n: Notice): boolean {
  return n.level === "error" && (n.code.startsWith("limit.") || n.code.startsWith("invalid."));
}

interface SettingRange {
  path: string;
  label: string;
  get: (s: Settings) => number;
  min: number;
  max: number;
}

/**
 * Advanced-settings ranges. Minimums of 0.8 mm follow the minimum printable
 * feature width (spec §6.1); topPressFit is spec §3 rule 2.
 */
export const SETTING_RANGES: SettingRange[] = [
  { path: "wall", label: "Wall", get: (s) => s.wall, min: 0.8, max: 10 },
  { path: "floor", label: "Floor", get: (s) => s.floor, min: 0.8, max: 10 },
  { path: "divider", label: "Divider", get: (s) => s.divider, min: 0.8, max: 10 },
  { path: "fit", label: "Fit", get: (s) => s.fit, min: 0.1, max: 3 },
  { path: "cardClearance", label: "Card clearance", get: (s) => s.cardClearance, min: 0, max: 20 },
  {
    path: "cardStackClearance",
    label: "Card stack clearance",
    get: (s) => s.cardStackClearance,
    min: 0,
    max: 20,
  },
  {
    path: "cardStackClearancePct",
    label: "Card stack clearance (fraction of the stack)",
    get: (s) => s.cardStackClearancePct,
    min: 0,
    max: 0.5,
  },
  {
    path: "cardThickness",
    label: "Card thickness",
    get: (s) => s.cardThickness,
    min: 0.05,
    max: 5,
  },
  {
    path: "pieceClearance",
    label: "Piece clearance",
    get: (s) => s.pieceClearance,
    min: 0,
    max: 20,
  },
  { path: "boxClearance", label: "Box clearance", get: (s) => s.boxClearance, min: 0, max: 10 },
  { path: "trayGap", label: "Tray gap", get: (s) => s.trayGap, min: 0, max: 5 },
  { path: "bottomChamfer", label: "Bottom chamfer", get: (s) => s.bottomChamfer, min: 0, max: 3 },
  { path: "cornerRadius", label: "Corner radius", get: (s) => s.cornerRadius, min: 0, max: 50 },
  { path: "scoopRadius", label: "Scoop radius", get: (s) => s.scoopRadius, min: 0, max: 100 },
  {
    path: "fingerPocket/width",
    label: "Finger pocket width",
    get: (s) => s.fingerPocket.width,
    min: 5,
    max: 100,
  },
  {
    path: "fingerPocket/reach",
    label: "Finger pocket reach",
    get: (s) => s.fingerPocket.reach,
    min: 0,
    max: 100,
  },
  { path: "lip/height", label: "Lip height", get: (s) => s.lip.height, min: 0.5, max: 10 },
  { path: "lip/thickness", label: "Lip thickness", get: (s) => s.lip.thickness, min: 0.8, max: 5 },
  { path: "lip/ledge", label: "Lip ledge", get: (s) => s.lip.ledge, min: 0.5, max: 10 },
  { path: "lip/play", label: "Lip play", get: (s) => s.lip.play, min: 0, max: 2 },
  { path: "topPressFit", label: "Top press fit", get: (s) => s.topPressFit, min: -2, max: 1 },
  {
    path: "packingFactor",
    label: "Packing factor",
    get: (s) => s.packingFactor,
    min: 0.05,
    max: 1,
  },
];

class Checker {
  readonly notices: Notice[] = [];

  error(code: string, path: string, message: string): void {
    this.notices.push({ level: "error", code, path, message });
  }

  warning(code: string, path: string, message: string): void {
    this.notices.push({ level: "warning", code, path, message });
  }

  /** 0 < x ≤ 1000 mm. `!(x > 0)` also catches NaN. */
  length(path: string, label: string, x: number): void {
    if (!(x > 0)) {
      this.error("field.length", path, `${label} must be greater than 0 mm.`);
    } else if (x > BOUNDS.maxLength) {
      this.error("limit.length", path, `${label} must be at most ${BOUNDS.maxLength} mm.`);
    }
  }

  /** 0 ≤ x ≤ 1000 mm. */
  nonNegativeLength(path: string, label: string, x: number): void {
    if (!(x >= 0)) {
      this.error("field.length", path, `${label} must be 0 mm or more.`);
    } else if (x > BOUNDS.maxLength) {
      this.error("limit.length", path, `${label} must be at most ${BOUNDS.maxLength} mm.`);
    }
  }

  /** Whole number 1…2000. */
  count(path: string, label: string, n: number): void {
    if (!Number.isInteger(n) || n < 1) {
      this.error("field.count", path, `${label} must be a whole number of at least 1.`);
    } else if (n > BOUNDS.maxCount) {
      this.error("limit.count", path, `${label} must be at most ${BOUNDS.maxCount}.`);
    }
  }

  notEmpty(path: string, what: string, list: unknown[]): void {
    if (list.length === 0) {
      this.error("field.empty", path, `Add at least one ${what}.`);
    }
  }
}

function checkBase(ck: Checker, c: Component, at: string): void {
  if (c.perPlayer) {
    const n = c.perPlayer.players;
    if (!Number.isInteger(n) || n < 1) {
      ck.error(
        "field.players",
        `${at}/perPlayer/players`,
        "Players must be a whole number of at least 1.",
      );
    } else if (n > BOUNDS.maxPlayers) {
      ck.error(
        "limit.players",
        `${at}/perPlayer/players`,
        `Players must be at most ${BOUNDS.maxPlayers}.`,
      );
    }
    if (c.groupId !== undefined) {
      ck.error(
        "field.perPlayerInGroup",
        `${at}/perPlayer`,
        "A grouped component can't be per player. Remove it from the group or turn off per player.",
      );
    }
  }
  if (c.clearance !== undefined) {
    ck.nonNegativeLength(`${at}/clearance`, "Clearance", c.clearance);
  }
}

function checkComponent(ck: Checker, c: Component, at: string): void {
  checkBase(ck, c, at);
  switch (c.kind) {
    case "cards": {
      ck.length(`${at}/shortSide`, "Card short side", c.shortSide);
      ck.length(`${at}/longSide`, "Card long side", c.longSide);
      if (c.shortSide > c.longSide) {
        ck.warning(
          "field.cardSides",
          `${at}/shortSide`,
          "The short side is longer than the long side; they will be swapped.",
        );
      }
      ck.notEmpty(`${at}/decks`, "deck", c.decks);
      c.decks.forEach((deck, i) => {
        ck.count(`${at}/decks/${i}/count`, "Card count", deck.count);
      });
      if (typeof c.sleeve === "object") {
        ck.length(`${at}/sleeve/w`, "Sleeve width", c.sleeve.w);
        ck.length(`${at}/sleeve/h`, "Sleeve height", c.sleeve.h);
        ck.nonNegativeLength(`${at}/sleeve/thickness`, "Sleeve thickness", c.sleeve.thickness);
      }
      if (c.thickness.mode === "measured") {
        ck.count(`${at}/thickness/cards`, "Measured card count", c.thickness.cards);
        ck.length(`${at}/thickness/stackMm`, "Measured stack height", c.thickness.stackMm);
      }
      return;
    }
    case "bulk":
      ck.notEmpty(`${at}/items`, "item", c.items);
      c.items.forEach((item, i) => {
        const p = `${at}/items/${i}`;
        if ("volumeMl" in item) {
          if (!(item.volumeMl > 0)) {
            ck.error("field.volume", `${p}/volumeMl`, "Volume must be greater than 0 ml.");
          } else if (item.volumeMl > MAX_VOLUME_ML) {
            ck.error(
              "limit.volume",
              `${p}/volumeMl`,
              `Volume must be at most ${MAX_VOLUME_ML} ml.`,
            );
          }
        } else {
          ck.count(`${p}/count`, "Count", item.count);
          ck.length(`${p}/w`, "Width", item.w);
          ck.length(`${p}/d`, "Depth", item.d);
          ck.length(`${p}/h`, "Height", item.h);
        }
      });
      return;
    case "tiles":
      if (c.shape.type === "rect") {
        ck.length(`${at}/shape/w`, "Tile width", c.shape.w);
        ck.length(`${at}/shape/d`, "Tile depth", c.shape.d);
      } else {
        ck.length(`${at}/shape/flatToFlat`, "Hex size (flat to flat)", c.shape.flatToFlat);
      }
      ck.length(`${at}/thickness`, "Tile thickness", c.thickness);
      ck.count(`${at}/count`, "Tile count", c.count);
      return;
    case "minis":
      ck.notEmpty(`${at}/figures`, "figure", c.figures);
      c.figures.forEach((f, i) => {
        const p = `${at}/figures/${i}`;
        ck.length(`${p}/w`, "Width", f.w);
        ck.length(`${p}/d`, "Depth", f.d);
        ck.length(`${p}/h`, "Height", f.h);
        ck.count(`${p}/count`, "Count", f.count);
      });
      return;
    case "custom":
      ck.length(`${at}/w`, "Width", c.w);
      ck.length(`${at}/d`, "Depth", c.d);
      ck.length(`${at}/h`, "Height", c.h);
      ck.count(`${at}/count`, "Count", c.count);
      return;
  }
}

function checkLock(ck: Checker, lock: Lock, at: string): void {
  switch (lock.kind) {
    case "position":
      if (!/^[01]*$/.test(lock.path)) {
        ck.error("field.lockPath", `${at}/path`, "A position lock path may only contain 0 and 1.");
      }
      return;
    case "size":
      ck.length(`${at}/w`, "Locked width", lock.w);
      ck.length(`${at}/d`, "Locked depth", lock.d);
      ck.length(`${at}/h`, "Locked height", lock.h);
      return;
    case "stack":
      if (lock.trayKeys.length === 0) {
        ck.error("field.lockStack", `${at}/trayKeys`, "A stack lock needs at least one tray.");
      }
      return;
  }
}

/**
 * Field-level validation (spec §5 bounds, spec §10). Never throws; every
 * problem is a Notice whose `path` points at the field. Plans 4 and 5 must not
 * optimize while any notice has level "error".
 */
export function validateProject(p: Project): Notice[] {
  const ck = new Checker();
  const { box, printer, settings } = p;

  ck.length("/box/innerWidth", "Box width", box.innerWidth);
  ck.length("/box/innerDepth", "Box depth", box.innerDepth);
  ck.length("/box/innerHeight", "Box height", box.innerHeight);
  ck.nonNegativeLength("/box/headroom", "Headroom", box.headroom);
  if (box.headroom >= box.innerHeight) {
    ck.error("field.headroom", "/box/headroom", "Headroom must be less than the box height.");
  }

  ck.length("/printer/bedX", "Bed X", printer.bedX);
  ck.length("/printer/bedY", "Bed Y", printer.bedY);
  ck.length("/printer/bedZ", "Bed Z", printer.bedZ);
  ck.nonNegativeLength("/printer/bedMargin", "Bed margin", printer.bedMargin);
  if (2 * printer.bedMargin >= Math.min(printer.bedX, printer.bedY)) {
    ck.error("field.bedMargin", "/printer/bedMargin", "Bed margin leaves no usable bed.");
  }
  if (!(printer.layerHeight >= 0.05 && printer.layerHeight <= 1)) {
    ck.error("field.layerHeight", "/printer/layerHeight", "Layer height must be 0.05 to 1 mm.");
  }

  for (const r of SETTING_RANGES) {
    const v = r.get(settings);
    if (!(v >= r.min && v <= r.max)) {
      ck.error(
        "field.setting",
        `/settings/${r.path}`,
        `${r.label} must be from ${r.min} to ${r.max}.`,
      );
    }
  }

  if (p.components.length > BOUNDS.maxComponents) {
    ck.error(
      "limit.components",
      "/components",
      `Too many components (${p.components.length}); the maximum is ${BOUNDS.maxComponents}.`,
    );
  }
  const seen = new Set<string>();
  p.components.forEach((c, i) => {
    if (seen.has(c.id)) {
      ck.error(
        "invalid.duplicateId",
        `/components/${i}/id`,
        `Two components share the id "${c.id}".`,
      );
    }
    seen.add(c.id);
    checkComponent(ck, c, `/components/${i}`);
  });

  p.locks.forEach((lock, i) => {
    checkLock(ck, lock, `/locks/${i}`);
  });

  return ck.notices;
}
