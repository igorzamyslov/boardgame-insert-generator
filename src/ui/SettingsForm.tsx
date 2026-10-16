// src/ui/SettingsForm.tsx
// The fields of the settings sheet: "This insert" (how trays sit) and the printing options.
import { useContext, useRef, useState } from "preact/hooks";
import {
  DEFAULT_SETTINGS,
  FINGER_DIVIDER_ROOM_MM,
  FINGER_ROOM_MM,
  FIT_CHOICES,
  WALL_CHOICES,
  applyFingerRoom,
  applyFitChoice,
  applyWallChoice,
  fingerRoomOf,
  fitChoiceOf,
  wallChoiceOf,
} from "../model/settings";
import type { FitChoice, WallChoice } from "../model/settings";
import type { Settings } from "../model/types";
import { ONE_WALL_MAX_MM } from "../sizing/constants";
import { SETTING_RANGES } from "../model/validate";
import { CheckField, SelectField } from "./fields";
import type { SelectOption } from "./fields";
import { NumberField, formatNumber } from "./NumberField";
import { SETTING_SETTERS, settingUnit } from "./settingsFields";
import { ValidationContext } from "./validation";

export interface SettingsFormProps {
  settings: Settings;
  onChange: (s: Settings) => void;
}

function wallOptions(s: Settings): SelectOption<WallChoice | "custom">[] {
  const options: SelectOption<WallChoice | "custom">[] = [
    { value: "thin", label: `Thin (${WALL_CHOICES.thin} mm)` },
    { value: "normal", label: `Normal (${WALL_CHOICES.normal} mm)` },
    { value: "sturdy", label: `Sturdy (${WALL_CHOICES.sturdy} mm)` },
  ];
  if (wallChoiceOf(s) === "custom") {
    options.push({ value: "custom", label: `Custom (${s.wall} mm)`, disabled: true });
  }
  return options;
}

function fitOptions(s: Settings): SelectOption<FitChoice | "custom">[] {
  const options: SelectOption<FitChoice | "custom">[] = [
    { value: "tight", label: `Tight (×${FIT_CHOICES.tight})` },
    { value: "normal", label: `Normal (×${FIT_CHOICES.normal})` },
    { value: "loose", label: `Loose (×${FIT_CHOICES.loose})` },
  ];
  if (fitChoiceOf(s) === "custom") {
    options.push({ value: "custom", label: `Custom (×${s.fit})`, disabled: true });
  }
  return options;
}

const WALL_ABSORB_PATH = "wallAbsorb";

/** The fields of the Exact numbers panel (wallAbsorb sits beside Unused space, outside it). */
const PANEL_RANGES = SETTING_RANGES.filter((r) => r.path !== WALL_ABSORB_PATH);

/** The panel's fields whose value differs from DEFAULT_SETTINGS. */
export function changedRanges(s: Settings): typeof PANEL_RANGES {
  return PANEL_RANGES.filter((r) => r.get(s) !== r.get(DEFAULT_SETTINGS));
}

/** Puts every panel field back to its default, leaving the choices outside the panel as they are. */
export function restoreAllExact(s: Settings): Settings {
  return changedRanges(s).reduce((acc, r) => {
    const set = SETTING_SETTERS[r.path];
    return set ? set(acc, r.get(DEFAULT_SETTINGS)) : acc;
  }, s);
}

function defaultText(path: string, value: number): string {
  const unit = settingUnit(path);
  return `${formatNumber(value)}${unit === undefined ? "" : ` ${unit}`}`;
}

/** Under a field that differs from its default: says so, quietly, and offers to put it back. */
function ChangedNote(p: {
  fieldId: string;
  label: string;
  defaultText: string;
  onRestore: () => void;
}) {
  return (
    <p class="hint field-changed" id={`${p.fieldId}-changed`}>
      {`Changed from the default, ${p.defaultText}. `}
      <button
        type="button"
        class="quiet tap"
        aria-label={`Restore the default for ${p.label}`}
        onClick={() => {
          p.onRestore();
          // The note goes away with the difference: keep the keyboard where it was.
          document.getElementById(p.fieldId)?.focus();
        }}
      >
        Restore
      </button>
    </p>
  );
}

function plural(n: number): string {
  return n === 1 ? "1 value" : `${n} values`;
}

/**
 * "Restore all", shown only while something differs from the default and asked twice: the first
 * press only offers the choice, so a stray click discards nothing.
 */
function RestoreAll({ count, onRestore }: { count: number; onRestore: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <div class="button-row">
        <button type="button" class="quiet tap" onClick={() => setAsking(true)}>
          Restore all exact numbers
        </button>
      </div>
    );
  }
  return (
    <div
      class="button-row restore-all"
      role="group"
      aria-label="Confirm restoring all exact numbers"
    >
      <span class="hint">{`Put ${plural(count)} back to their defaults? Your own numbers are lost.`}</span>
      <button
        type="button"
        class="tap"
        onClick={() => {
          setAsking(false);
          onRestore();
        }}
      >
        Restore
      </button>
      <button type="button" class="quiet tap" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </div>
  );
}
const wallAbsorbRange = SETTING_RANGES.find((r) => r.path === WALL_ABSORB_PATH);

const PANEL_PATHS: ReadonlySet<string> = new Set(PANEL_RANGES.map((r) => `/settings/${r.path}`));

type PanelRange = (typeof PANEL_RANGES)[number];

/** True when every word of the query is in the field's name or its hint (case does not matter). */
function matchesQuery(r: PanelRange, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${r.label} ${r.hint}`.toLowerCase();
  return words.every((w) => text.includes(w));
}

const exactId = (r: PanelRange): string => `settings-${r.path.replace("/", "-")}`;

/** The numbers behind the choices: a search, every field, and per-value and all-at-once restore. */
function ExactValues({ settings, onChange }: SettingsFormProps) {
  const notices = useContext(ValidationContext);
  const hasError = notices.some(
    (n) => n.level === "error" && n.path !== undefined && PANEL_PATHS.has(n.path),
  );
  // An error in a field of the closed "Exact numbers" opens it, and it stays open while the user
  // fixes the error.
  const forced = useRef(false);
  if (hasError) {
    forced.current = true;
  }
  const [query, setQuery] = useState("");
  const changed = changedRanges(settings);
  const searching = query.trim() !== "";
  const withError = (r: PanelRange): boolean =>
    notices.some((n) => n.level === "error" && n.path === `/settings/${r.path}`);
  // A field with an error stays on screen whatever the search says.
  const shown = searching
    ? PANEL_RANGES.filter((r) => matchesQuery(r, query) || withError(r))
    : PANEL_RANGES;
  return (
    <details class="pf-disc" open={forced.current || undefined}>
      <summary>
        Exact numbers
        {changed.length > 0 ? <span class="pf-count">{`${changed.length} changed`}</span> : null}
      </summary>
      <div class="pf-disc__body">
        <div class="field">
          <label htmlFor="settings-exact-search">Search exact numbers</label>
          <input
            id="settings-exact-search"
            type="search"
            autoComplete="off"
            value={query}
            placeholder="clearance, corner, lip…"
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <p class="hint" role="status">
            {searching
              ? shown.length === 0
                ? "No exact number matches."
                : `${shown.length} of ${PANEL_RANGES.length} shown.`
              : ""}
          </p>
        </div>
        {changed.length > 0 ? (
          <RestoreAll
            count={changed.length}
            onRestore={() => onChange(restoreAllExact(settings))}
          />
        ) : null}
        <div class="form-grid">
          {shown.map((r) => (
            <NumberField
              key={r.path}
              id={exactId(r)}
              label={r.label}
              unit={settingUnit(r.path)}
              value={r.get(settings)}
              path={`/settings/${r.path}`}
              min={r.min}
              max={r.max}
              hint={r.hint}
              footer={
                changed.includes(r) ? (
                  <ChangedNote
                    fieldId={exactId(r)}
                    label={r.label}
                    defaultText={defaultText(r.path, r.get(DEFAULT_SETTINGS))}
                    onRestore={() => {
                      const set = SETTING_SETTERS[r.path];
                      if (set) {
                        onChange(set(settings, r.get(DEFAULT_SETTINGS)));
                      }
                    }}
                  />
                ) : undefined
              }
              onCommit={(v) => {
                const set = SETTING_SETTERS[r.path];
                if (set) {
                  onChange(set(settings, v));
                }
              }}
            />
          ))}
        </div>
      </div>
    </details>
  );
}

/** The sheet's "This insert" tab: how the trays sit in the box. */
export function InsertSettings({ settings, onChange }: SettingsFormProps) {
  return (
    <div class="form-grid">
      <PlainChoices settings={settings} onChange={onChange} />
      <CheckField
        id="settings-lip-enabled"
        label="Rim between layers"
        checked={settings.lip.enabled}
        hint="A rim on each tray that fits a groove under the tray above, so stacks stay flush and do not shift. Without it, stacked trays can shift; the app then warns."
        onChange={(enabled) => onChange({ ...settings, lip: { ...settings.lip, enabled } })}
      />
      <CheckField
        id="settings-fillToTop"
        label="Fill to the lid"
        checked={settings.fillToTop}
        hint="Trays are padded so every stack reaches the lid and nothing shifts when the box is carried. Turn it off for shorter trays and some empty space above them."
        onChange={(fillToTop) => onChange({ ...settings, fillToTop })}
      />
      <SelectField
        id="settings-leftover"
        label="Unused space"
        value={settings.leftover}
        hint="What fills the box area the trays do not need. A spare tray is an open tray you can use for extras. A solid block is printed solid, which holds nothing and uses more filament. The same choice applies to risers and card spacers."
        options={[
          { value: "spare", label: "Spare tray (open)" },
          { value: "solid", label: "Solid block" },
        ]}
        onChange={(leftover) => onChange({ ...settings, leftover })}
      />
      <CheckField
        id="settings-oneWall"
        label="One thick wall instead of a spacer"
        checked={settings.oneWall}
        hint={`Where a gap would be a spacer, one wall of the neighbouring tray takes it instead, up to ${ONE_WALL_MAX_MM} mm per direction: fewer spacers to place, but a fat wall that holds nothing and more filament. It is never a wall with a finger cut, and a bigger gap is still a spacer. Replaces "Thicker walls instead of a spacer" while on. Changes the layout.`}
        onChange={(oneWall) => onChange({ ...settings, oneWall })}
      />
      {wallAbsorbRange ? (
        <NumberField
          id="settings-wallAbsorb"
          label={wallAbsorbRange.label}
          unit="mm"
          value={settings.wallAbsorb}
          path="/settings/wallAbsorb"
          min={wallAbsorbRange.min}
          max={wallAbsorbRange.max}
          hint={wallAbsorbRange.hint}
          onCommit={(wallAbsorb) => onChange({ ...settings, wallAbsorb })}
        />
      ) : null}
      <ExactValues settings={settings} onChange={onChange} />
    </div>
  );
}

/** The sheet's printing options: they change the printed parts, never where the trays sit. */
export function PrintingOptions({ settings, onChange }: SettingsFormProps) {
  return (
    <div class="form-grid">
      <CheckField
        id="settings-engraveNames"
        label="Engrave tray names"
        checked={settings.engraveNames}
        hint="Cuts each tray's name, shortened to fit, into two opposite outer walls and under the tray, shallow recesses you can read once the tray is out of the box (the name under it is mirrored, so it reads right when you turn the tray over). A side that is too small or too thin is left plain, and so is a tray with no room anywhere. Plates that go inside another tray (card spacers, dividers) carry none. Only the printed trays change: your layout stays the same."
        onChange={(engraveNames) => onChange({ ...settings, engraveNames })}
      />
      <CheckField
        id="settings-mergeFillers"
        label="Join spacers into fewer pieces to print"
        checked={settings.mergeFillers}
        hint="Spacers that touch (across the gap between trays) print as one piece, the largest that fits your print bed, so there are fewer loose pieces to place by hand. Only the printed pieces change: your layout stays the same. A bigger piece warps a little more and a failed print loses more at once."
        onChange={(mergeFillers) => onChange({ ...settings, mergeFillers })}
      />
      <CheckField
        id="settings-mergeRisers"
        label="Fold risers into the joined spacers"
        checked={settings.mergeRisers}
        disabled={!settings.mergeFillers}
        hint="Also prints the riser under a stack with the spacer beside it: a low shelf the tray rests on with a full-height wall alongside. Fewer pieces again, and the joined piece goes in before the trays that rest on it. Needs joined spacers."
        onChange={(mergeRisers) => onChange({ ...settings, mergeRisers })}
      />
    </div>
  );
}

/** The finger room switch's hint: what it does, and a custom value if there is one. */
function fingerRoomHint(s: Settings): string {
  const base = `Makes the outer walls the finger cutouts go through ${FINGER_ROOM_MM} mm and the dividers they cross ${FINGER_DIVIDER_ROOM_MM} mm thicker, so you can reach in when trays sit tight.`;
  const { wallRoom, dividerRoom } = s.fingerPocket;
  return fingerRoomOf(s) === "custom"
    ? `${base} Custom: ${wallRoom} mm walls, ${dividerRoom} mm dividers.`
    : base;
}

/**
 * Choices that write resolved numbers (spec §5): fit, walls and the finger room switch (on for
 * any wall room, including a custom one). The numbers themselves are under Exact numbers.
 */
function PlainChoices({ settings, onChange }: SettingsFormProps) {
  return (
    <>
      <SelectField
        id="settings-fitChoice"
        label="Fit"
        value={fitChoiceOf(settings)}
        options={fitOptions(settings)}
        hint="Scales every clearance. Pick loose if your prints usually come out snug."
        onChange={(c) => {
          if (c !== "custom") {
            onChange(applyFitChoice(settings, c));
          }
        }}
      />
      <SelectField
        id="settings-wallChoice"
        label="Walls"
        value={wallChoiceOf(settings)}
        options={wallOptions(settings)}
        hint="Thickness of the outer walls. Thicker is stiffer but takes room from the contents."
        onChange={(c) => {
          if (c !== "custom") {
            onChange(applyWallChoice(settings, c));
          }
        }}
      />
      <CheckField
        id="settings-fingerRoom"
        label="Room for fingers"
        checked={fingerRoomOf(settings) !== false}
        hint={fingerRoomHint(settings)}
        onChange={(on) => onChange(applyFingerRoom(settings, on))}
      />
    </>
  );
}
