import { groupOf } from "./defaults";
import { deepFreeze } from "./freeze";
import {
  FLOAT_EPSILON,
  MIN_FEATURE_MM,
  MIN_WALL_MM,
  UPPER_MIN_CHAMFER,
  effective,
  effectiveBottomChamfer,
  maxBottomChamfer,
  topPlane,
} from "./settings";
import type { Component, Lock, Notice, Project, Settings } from "./types";

/**
 * Codes of the notices validateProject() emits, by family: `field.*` (shown
 * next to the field), `limit.*` (spec §5 upper bounds) and `invalid.*`
 * (corrupt structure). See isBlocking(). Frozen.
 */
export const VALIDATION_NOTICE_CODES = deepFreeze({
  field: {
    bedMargin: "field.bedMargin",
    bottomChamfer: "field.bottomChamfer",
    cardSides: "field.cardSides",
    curvedFloor: "field.curvedFloor",
    count: "field.count",
    empty: "field.empty",
    groupId: "field.groupId",
    headroom: "field.headroom",
    layerHeight: "field.layerHeight",
    length: "field.length",
    lipBearing: "field.lipBearing",
    lockPath: "field.lockPath",
    lockStack: "field.lockStack",
    perPlayerInGroup: "field.perPlayerInGroup",
    players: "field.players",
    setting: "field.setting",
    topPlane: "field.topPlane",
    volume: "field.volume",
  },
  limit: {
    components: "limit.components",
    count: "limit.count",
    length: "limit.length",
    players: "limit.players",
    volume: "limit.volume",
  },
  invalid: {
    duplicateId: "invalid.duplicateId",
    id: "invalid.id",
  },
} as const);

/** Spec §5 bounds, applied to UI edits, URL input and files. Frozen. */
export const BOUNDS = Object.freeze({
  maxComponents: 100,
  maxCount: 2000,
  maxLength: 1000,
  maxPlayers: 10,
} as const);

/** 1000 mm × 1000 mm × 1000 mm, in ml. */
export const MAX_VOLUME_ML = 1_000_000;

/** Printable layer height range, in mm. */
export const LAYER_HEIGHT_MIN = 0.05;
export const LAYER_HEIGHT_MAX = 1;

/**
 * Notices that make a file or link unloadable: upper bounds (`limit.*`, they
 * protect the optimizer from absurd input) and corrupt structure
 * (`invalid.*`). Everything else (`field.*`) is shown next to the field and
 * the project still loads, so a half-edited autosave never locks the user out.
 */
export function isBlocking(n: Notice): boolean {
  return n.level === "error" && (n.code.startsWith("limit.") || n.code.startsWith("invalid."));
}

export interface SettingRange {
  path: string;
  label: string;
  get: (s: Settings) => number;
  min: number;
  max: number;
  /** One or two plain sentences shown under the field: what it does and when to change it. */
  hint: string;
}

const settingRanges: SettingRange[] = [
  {
    path: "wall",
    label: "Wall",
    get: (s) => s.wall,
    min: MIN_WALL_MM,
    max: 10,
    hint: "Thickness of the outer walls of every tray. Thicker is stiffer but costs inner room.",
  },
  {
    path: "floor",
    label: "Floor",
    get: (s) => s.floor,
    min: MIN_FEATURE_MM,
    max: 10,
    hint: "Thickness of each tray's floor.",
  },
  {
    path: "divider",
    label: "Divider",
    get: (s) => s.divider,
    min: MIN_FEATURE_MM,
    max: 10,
    hint: "Thickness of the walls between compartments of one tray.",
  },
  {
    path: "fit",
    label: "Fit",
    get: (s) => s.fit,
    min: 0.1,
    max: 3,
    hint: "Multiplies every clearance marked as scaled by Fit (card, card stack, piece, box, tray gap and lip play). Below 1 is snugger, above 1 looser.",
  },
  {
    path: "cardClearance",
    label: "Card clearance",
    get: (s) => s.cardClearance,
    min: 0,
    max: 20,
    hint: "Extra width and length added around a sleeved card in its compartment. Scaled by Fit.",
  },
  {
    path: "cardStackClearance",
    label: "Card stack clearance",
    get: (s) => s.cardStackClearance,
    min: 0,
    max: 20,
    hint: "Extra room added to the thickness of a deck's stack, on top of the fraction below. Scaled by Fit.",
  },
  {
    path: "cardStackClearancePct",
    label: "Card stack clearance (fraction of the stack)",
    get: (s) => s.cardStackClearancePct,
    min: 0,
    max: 0.5,
    hint: "Extra room that grows with the deck: this fraction of the stack's thickness, times Fit, is added to its slot. It covers sleeves that bulge or cards that do not stack evenly.",
  },
  {
    path: "cardThickness",
    label: "Card thickness",
    get: (s) => s.cardThickness,
    min: 0.05,
    max: 5,
    hint: "Thickness of one unsleeved card. Sleeves add to it. Measuring a stack in the card's own options overrides it.",
  },
  {
    path: "pieceClearance",
    label: "Piece clearance",
    get: (s) => s.pieceClearance,
    min: 0,
    max: 20,
    hint: "Extra room around each token, tile or miniature in its pocket. Scaled by Fit.",
  },
  {
    path: "boxClearance",
    label: "Box clearance",
    get: (s) => s.boxClearance,
    min: 0,
    max: 10,
    hint: "Gap kept between the trays and the box walls on each side, so the insert drops in. Scaled by Fit. It counts twice in the sideways play warning, once per side.",
  },
  {
    path: "trayGap",
    label: "Tray gap",
    get: (s) => s.trayGap,
    min: 0,
    max: 5,
    hint: "Gap between neighbouring trays on the same layer. Scaled by Fit. It counts once per extra tray in a row in the sideways play warning.",
  },
  {
    path: "bottomChamfer",
    label: "Bottom chamfer",
    get: (s) => s.bottomChamfer,
    min: 0,
    max: 3,
    hint: "Slopes the bottom edge of each tray at 45° by this much, so first-layer squish does not stop trays from sitting flat. Trays stacked above another get at least 0.5 mm.",
  },
  {
    path: "cornerRadius",
    label: "Corner radius",
    get: (s) => s.cornerRadius,
    min: 0,
    max: 50,
    hint: "Rounds the outer vertical corners of the trays. The app raises it where the bottom chamfer needs it.",
  },
  {
    path: "scoopRadius",
    label: "Scoop radius",
    get: (s) => s.scoopRadius,
    min: 0,
    max: 100,
    hint: "Radius of the curved ramp on a scoop side of a compartment, so small pieces can be picked up. It shrinks where the compartment is too small for it.",
  },
  {
    path: "fingerPocket/width",
    label: "Finger cut width",
    get: (s) => s.fingerPocket.width,
    min: 5,
    max: 100,
    hint: "Width of each finger cutout in a wall or divider. Cutouts that would come out narrower than 10 mm are left out.",
  },
  {
    path: "fingerPocket/floorNotch",
    label: "Finger cutout floor notch reach",
    get: (s) => s.fingerPocket.floorNotch,
    min: 0,
    max: 50,
    hint: "How far a cutout's slot continues down through the floor and into the compartment, measured from its wall, so a fingertip gets under a flat stack. 0 means no notch.",
  },
  {
    path: "fingerPocket/wallRoom",
    label: "Finger room in cut walls",
    get: (s) => s.fingerPocket.wallRoom,
    min: 0,
    max: 20,
    hint: "How much thicker the outer walls get where a finger cutout passes through, so a finger fits when trays sit tight against the box. 0 leaves them as is.",
  },
  {
    path: "fingerPocket/dividerRoom",
    label: "Finger room in cut dividers",
    get: (s) => s.fingerPocket.dividerRoom,
    min: 0,
    max: 20,
    hint: "How much thicker a divider gets where a finger cutout crosses it, so a finger fits between two stacks. 0 leaves it as is.",
  },
  {
    path: "lip/height",
    label: "Lip height",
    get: (s) => s.lip.height,
    min: 1,
    max: 10,
    hint: "How far the locating lip rises above a tray's rim. Only used when the lip is on.",
  },
  {
    path: "lip/thickness",
    label: "Lip thickness",
    get: (s) => s.lip.thickness,
    min: MIN_WALL_MM,
    max: 5,
    hint: "Wall thickness of the lip ring. The tray above sits inside it. Only used when the lip is on.",
  },
  {
    path: "lip/ledge",
    label: "Lip ledge",
    get: (s) => s.lip.ledge,
    min: 0.5,
    max: 10,
    hint: "Width of the flat band between the lip and the compartments, which the tray above rests on. Lipped trays keep their compartments at least lip thickness plus ledge from the outer faces.",
  },
  {
    path: "lip/play",
    label: "Lip play",
    get: (s) => s.lip.play,
    min: 0,
    max: 2,
    hint: "Sideways room between the lip and the tray sitting inside it, per side. Scaled by Fit. Too little and trays will not drop in; too much and they rattle.",
  },
  {
    path: "topPressFit",
    label: "Top press fit",
    get: (s) => s.topPressFit,
    min: -2,
    max: 1,
    hint: "Moves the height every stack must reach: positive makes stacks taller than the box so the lid presses them still, negative leaves a gap under the lid. 0 means flush with the lid.",
  },
  {
    path: "packingFactor",
    label: "Packing factor",
    get: (s) => s.packingFactor,
    min: 0.05,
    max: 1,
    hint: "Share of a loose-pieces scoop tray that the pieces actually fill. Their own volume divided by this sizes the tray, so 0.5 gives twice the room and lower is roomier.",
  },
];

/**
 * Advanced-settings ranges. Floor and divider minimums are MIN_FEATURE_MM, the minimum printable
 * feature width (spec §6.1). Wall and lip thickness minimums are MIN_WALL_MM, which adds
 * CORNER_MARGIN: a sharp cut corner at the wall keeps MIN_FEATURE_MM to the polygon of the rounded
 * outer corner only with that margin (maxCornerRadius in ./settings), and the lip is a ring
 * between two concentric polygons, only t·cos(Δ/2) thick at a corner facet, so a lip of
 * MIN_FEATURE_MM measures thinner than that (0.9·cos(22.5°) = 0.83 mm passes). topPressFit is
 * spec §3 rule 2. The floor notch of flat cards' and tiles'
 * wall cutouts reaches 0 (off) to 50 mm into the floor (a half-disc at half the finger width), and
 * the finger room added to the outer walls and dividers they cut is 0 (off) to 20 mm. The lip
 * is at least 1 mm high: the geometry chamfers its inner top edge by 0.6 mm and a lower lip is
 * useless. Frozen, entries included.
 */
export const SETTING_RANGES: readonly SettingRange[] = Object.freeze(
  settingRanges.map((r) => Object.freeze(r)),
);

/**
 * Collects notices. Each check returns true when the value is valid (no notice
 * was added), so cross-field checks can run only on values that passed.
 */
class Checker {
  readonly notices: Notice[] = [];

  error(code: string, path: string, message: string): void {
    this.notices.push({ level: "error", code, path, message });
  }

  warning(code: string, path: string, message: string): void {
    this.notices.push({ level: "warning", code, path, message });
  }

  /** 0 < x ≤ 1000 mm. `!(x > 0)` also catches NaN. */
  length(path: string, label: string, x: number): boolean {
    if (!(x > 0)) {
      this.error(VALIDATION_NOTICE_CODES.field.length, path, `${label} must be greater than 0 mm.`);
      return false;
    }
    if (x > BOUNDS.maxLength) {
      this.error(
        VALIDATION_NOTICE_CODES.limit.length,
        path,
        `${label} must be at most ${BOUNDS.maxLength} mm.`,
      );
      return false;
    }
    return true;
  }

  /** 0 ≤ x ≤ 1000 mm. */
  nonNegativeLength(path: string, label: string, x: number): boolean {
    if (!(x >= 0)) {
      this.error(VALIDATION_NOTICE_CODES.field.length, path, `${label} must be 0 mm or more.`);
      return false;
    }
    if (x > BOUNDS.maxLength) {
      this.error(
        VALIDATION_NOTICE_CODES.limit.length,
        path,
        `${label} must be at most ${BOUNDS.maxLength} mm.`,
      );
      return false;
    }
    return true;
  }

  /** Whole number 1…2000. The upper bound is tested first so 2000.5 and Infinity are blocking. */
  count(path: string, label: string, n: number): boolean {
    if (n > BOUNDS.maxCount) {
      this.error(
        VALIDATION_NOTICE_CODES.limit.count,
        path,
        `${label} must be at most ${BOUNDS.maxCount}.`,
      );
      return false;
    }
    if (!Number.isInteger(n) || n < 1) {
      this.error(
        VALIDATION_NOTICE_CODES.field.count,
        path,
        `${label} must be a whole number of at least 1.`,
      );
      return false;
    }
    return true;
  }

  notEmpty(path: string, what: string, list: unknown[]): void {
    if (list.length === 0) {
      this.error(VALIDATION_NOTICE_CODES.field.empty, path, `Add at least one ${what}.`);
    }
  }
}

function checkBase(ck: Checker, c: Component, at: string): void {
  if (c.perPlayer) {
    const n = c.perPlayer.players;
    if (n > BOUNDS.maxPlayers) {
      ck.error(
        VALIDATION_NOTICE_CODES.limit.players,
        `${at}/perPlayer/players`,
        `Players must be at most ${BOUNDS.maxPlayers}.`,
      );
    } else if (!Number.isInteger(n) || n < 1) {
      ck.error(
        VALIDATION_NOTICE_CODES.field.players,
        `${at}/perPlayer/players`,
        "Players must be a whole number of at least 1.",
      );
    }
    if (groupOf(c) !== undefined) {
      ck.error(
        VALIDATION_NOTICE_CODES.field.perPlayerInGroup,
        `${at}/perPlayer`,
        "A grouped component can't be per player. Remove it from the group or turn off per player.",
      );
    }
  }
  if (c.clearance !== undefined) {
    ck.nonNegativeLength(`${at}/clearance`, "Clearance", c.clearance);
  }
  // A curved floor bends cards and tilts upright tiles (spec §6.1).
  if (c.curvedFloor === true && (c.kind === "cards" || c.kind === "tiles")) {
    ck.error(
      VALIDATION_NOTICE_CODES.field.curvedFloor,
      `${at}/curvedFloor`,
      c.kind === "cards"
        ? "Cards can't have a curved floor: they would bend. Turn it off."
        : "Tiles can't have a curved floor: upright tiles would tilt. Turn it off.",
    );
  }
}

function checkComponent(ck: Checker, c: Component, at: string): void {
  checkBase(ck, c, at);
  switch (c.kind) {
    case "cards": {
      const shortOk = ck.length(`${at}/shortSide`, "Card short side", c.shortSide);
      const longOk = ck.length(`${at}/longSide`, "Card long side", c.longSide);
      if (shortOk && longOk && c.shortSide > c.longSide) {
        ck.warning(
          VALIDATION_NOTICE_CODES.field.cardSides,
          `${at}/shortSide`,
          "The short side is longer than the long side; they will be swapped.",
        );
      }
      ck.notEmpty(`${at}/decks`, "deck", c.decks);
      c.decks.forEach((deck, i) => {
        ck.count(`${at}/decks/${i}/count`, "Card count", deck.count);
      });
      if (c.sleeve !== null && typeof c.sleeve === "object") {
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
            ck.error(
              VALIDATION_NOTICE_CODES.field.volume,
              `${p}/volumeMl`,
              "Volume must be greater than 0 ml.",
            );
          } else if (item.volumeMl > MAX_VOLUME_ML) {
            ck.error(
              VALIDATION_NOTICE_CODES.limit.volume,
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

/**
 * One field.setting error per setting outside its SETTING_RANGES entry (NaN included), then the
 * cross-field rules, each checked only when the settings it reads are in range themselves:
 * - bottomChamfer ≤ maxBottomChamfer (field.bottomChamfer);
 * - with the lip on, an upper tray's bottom chamfer (effectiveBottomChamfer at level 1, at least
 *   UPPER_MIN_CHAMFER) is less than lip.ledge − 2 × the effective lip play, so the tray still
 *   rests on the ledge (field.lipBearing, at /settings/bottomChamfer; not added on top of
 *   field.bottomChamfer).
 */
function checkSettings(ck: Checker, settings: Settings): void {
  const outside = new Set<string>();
  for (const r of SETTING_RANGES) {
    const v = r.get(settings);
    if (!(v >= r.min && v <= r.max)) {
      outside.add(r.path);
      ck.error(
        VALIDATION_NOTICE_CODES.field.setting,
        `/settings/${r.path}`,
        `${r.label} must be from ${r.min} to ${r.max}.`,
      );
    }
  }
  if (["wall", "floor", "bottomChamfer"].some((path) => outside.has(path))) {
    return;
  }
  // FLOAT_EPSILON, not SPEC_TOLERANCE: a chamfer even 0.005 mm above maxBottomChamfer leaves a
  // forced R = c corner under MIN_FEATURE_MM + CORNER_MARGIN, which planTray rejects.
  const limit = maxBottomChamfer(settings);
  if (settings.bottomChamfer > limit + FLOAT_EPSILON) {
    ck.error(
      VALIDATION_NOTICE_CODES.field.bottomChamfer,
      "/settings/bottomChamfer",
      `Bottom chamfer must be at most ${Math.floor(limit * 100 + 1e-6) / 100} mm for this wall and floor.`,
    );
    return;
  }
  if (!settings.lip.enabled || ["lip/ledge", "lip/play", "fit"].some((path) => outside.has(path))) {
    return;
  }
  const bearing = settings.lip.ledge - 2 * effective(settings).lipPlay;
  if (!(effectiveBottomChamfer(settings, 1) < bearing - FLOAT_EPSILON)) {
    ck.error(
      VALIDATION_NOTICE_CODES.field.lipBearing,
      "/settings/bottomChamfer",
      `Upper trays would not rest on the lip: their bottom chamfer (at least ${UPPER_MIN_CHAMFER} mm) must be less than the lip ledge minus twice the play, ${Math.round(bearing * 100) / 100} mm.`,
    );
  }
}

/**
 * True when validateProject finds no settings problem: every setting inside its SETTING_RANGES
 * entry, the bottom chamfer within what the wall and floor leave, and (with the lip on) an upper
 * tray's chamfer still resting on the lip ledge. Sizing needs this.
 */
export function settingsValid(settings: Settings): boolean {
  const ck = new Checker();
  checkSettings(ck, settings);
  return ck.notices.length === 0;
}

/**
 * Per-component checks of validateProject: everything about one component's own
 * fields, with `path` rooted at `/components/<index>`. Cross-component checks
 * (empty or duplicate ids, group-name collisions) stay in validateProject. Sizing
 * calls this to skip a component that has an error-level notice.
 */
export function validateComponent(c: Component, index: number): Notice[] {
  const ck = new Checker();
  checkComponent(ck, c, `/components/${index}`);
  return ck.notices;
}

function checkLock(ck: Checker, lock: Lock, at: string): void {
  switch (lock.kind) {
    case "position":
      if (!/^[01]{0,64}$/.test(lock.path)) {
        ck.error(
          VALIDATION_NOTICE_CODES.field.lockPath,
          `${at}/path`,
          "A position lock path may only contain 0 and 1, up to 64 characters.",
        );
      }
      return;
    case "size":
      ck.length(`${at}/w`, "Locked width", lock.w);
      ck.length(`${at}/d`, "Locked depth", lock.d);
      ck.length(`${at}/h`, "Locked height", lock.h);
      return;
    case "stack":
      if (lock.trayKeys.length === 0) {
        ck.error(
          VALIDATION_NOTICE_CODES.field.lockStack,
          `${at}/trayKeys`,
          "A stack lock needs at least one tray.",
        );
      }
      return;
  }
}

/**
 * Field-level validation (spec §5 bounds, spec §10). Never throws for a
 * well-typed Project, such as one from parseProject or newProject; untrusted
 * JSON must go through parseProject first. Every problem is a Notice whose
 * `path` points at the field. Cross-field checks run
 * only on values that passed their own check, so one bad value never produces
 * a second notice. Plans 4 and 5 must not optimize while any notice has level
 * "error".
 */
export function validateProject(p: Project): Notice[] {
  const ck = new Checker();
  const { box, printer, settings } = p;

  // A cast or hand-built Project may lack an id; storage and links key projects by it.
  if (typeof p.id !== "string" || p.id === "") {
    ck.error(VALIDATION_NOTICE_CODES.invalid.id, "/id", "Project id must not be empty.");
  }

  ck.length("/box/innerWidth", "Box width", box.innerWidth);
  ck.length("/box/innerDepth", "Box depth", box.innerDepth);
  const heightOk = ck.length("/box/innerHeight", "Box height", box.innerHeight);
  const headroomOk = ck.nonNegativeLength("/box/headroom", "Headroom", box.headroom);
  if (heightOk && headroomOk) {
    if (box.headroom >= box.innerHeight) {
      ck.error(
        VALIDATION_NOTICE_CODES.field.headroom,
        "/box/headroom",
        "Headroom must be less than the box height.",
      );
    } else if (topPlane(box, settings) <= 0) {
      ck.error(
        VALIDATION_NOTICE_CODES.field.topPlane,
        "/box/headroom",
        "Box height minus headroom and press-fit leaves no room for trays.",
      );
    }
  }

  const bedXOk = ck.length("/printer/bedX", "Bed X", printer.bedX);
  const bedYOk = ck.length("/printer/bedY", "Bed Y", printer.bedY);
  ck.length("/printer/bedZ", "Bed Z", printer.bedZ);
  const marginOk = ck.nonNegativeLength("/printer/bedMargin", "Bed margin", printer.bedMargin);
  const bedTooSmallForMargin = 2 * printer.bedMargin >= Math.min(printer.bedX, printer.bedY);
  if (bedXOk && bedYOk && marginOk && bedTooSmallForMargin) {
    ck.error(
      VALIDATION_NOTICE_CODES.field.bedMargin,
      "/printer/bedMargin",
      "Bed margin leaves no usable bed.",
    );
  }
  if (!(printer.layerHeight >= LAYER_HEIGHT_MIN && printer.layerHeight <= LAYER_HEIGHT_MAX)) {
    ck.error(
      VALIDATION_NOTICE_CODES.field.layerHeight,
      "/printer/layerHeight",
      `Layer height must be ${LAYER_HEIGHT_MIN} to ${LAYER_HEIGHT_MAX} mm.`,
    );
  }

  checkSettings(ck, settings);

  if (p.components.length > BOUNDS.maxComponents) {
    ck.error(
      VALIDATION_NOTICE_CODES.limit.components,
      "/components",
      `Too many components (${p.components.length}); the maximum is ${BOUNDS.maxComponents}.`,
    );
  }
  const idCounts = new Map<string, number>();
  for (const c of p.components) {
    idCounts.set(c.id, (idCounts.get(c.id) ?? 0) + 1);
  }
  const seen = new Set<string>();
  p.components.forEach((c, i) => {
    const at = `/components/${i}`;
    if (c.id === "") {
      ck.error(VALIDATION_NOTICE_CODES.invalid.id, `${at}/id`, "Component id must not be empty.");
    } else if (c.id.includes(":")) {
      // Tray keys are `<component id>:p…`, matched by prefix, so a ":" in an id could make two collide.
      ck.error(VALIDATION_NOTICE_CODES.invalid.id, `${at}/id`, "A component id can't contain ':'.");
    } else if (seen.has(c.id)) {
      ck.error(
        VALIDATION_NOTICE_CODES.invalid.duplicateId,
        `${at}/id`,
        `Two components share the id "${c.id}".`,
      );
    }
    seen.add(c.id);
    const group = groupOf(c);
    if (group?.includes(":")) {
      // Tray keys are `<group or component id>:p…`, matched by prefix: a ":" would let two groups collide.
      ck.error(
        VALIDATION_NOTICE_CODES.field.groupId,
        `${at}/groupId`,
        "A group name can't contain ':'.",
      );
    } else if (group !== undefined) {
      // A component naming its own id as its group is not a collision.
      const others = (idCounts.get(group) ?? 0) - (group === c.id ? 1 : 0);
      if (others > 0) {
        ck.error(
          VALIDATION_NOTICE_CODES.field.groupId,
          `${at}/groupId`,
          "Group name collides with another component's id.",
        );
      }
    }
    checkComponent(ck, c, at);
  });

  p.locks.forEach((lock, i) => {
    checkLock(ck, lock, `/locks/${i}`);
  });

  return ck.notices;
}
