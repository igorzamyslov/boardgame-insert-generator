// src/ui/SettingsForm.tsx
import { useState } from "preact/hooks";
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

export interface SettingsFormProps {
  settings: Settings;
  advanced: boolean;
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

/** The fields of the Exact values panel (wallAbsorb sits beside Unused space, outside it). */
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
        class="quiet"
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
        <button type="button" class="quiet" onClick={() => setAsking(true)}>
          Restore all exact values
        </button>
      </div>
    );
  }
  return (
    <div
      class="button-row restore-all"
      role="group"
      aria-label="Confirm restoring all exact values"
    >
      <span class="hint">{`Put ${plural(count)} back to their defaults? Your own numbers are lost.`}</span>
      <button
        type="button"
        onClick={() => {
          setAsking(false);
          onRestore();
        }}
      >
        Restore
      </button>
      <button type="button" class="quiet" onClick={() => setAsking(false)}>
        Keep my values
      </button>
    </div>
  );
}
const wallAbsorbRange = SETTING_RANGES.find((r) => r.path === WALL_ABSORB_PATH);

export function SettingsForm({ settings, advanced, onChange }: SettingsFormProps) {
  if (!advanced) {
    return (
      <div class="form-grid">
        <SimpleChoices settings={settings} onChange={onChange} />
      </div>
    );
  }
  const changed = changedRanges(settings);
  return (
    <div class="form-grid">
      <SimpleChoices settings={settings} onChange={onChange} />
      <details class="pf-disc">
        <summary>
          Exact values
          {changed.length > 0 ? <span class="pf-count">{`${changed.length} changed`}</span> : null}
        </summary>
        <div class="pf-disc__body">
          {changed.length > 0 ? (
            <RestoreAll
              count={changed.length}
              onRestore={() => onChange(restoreAllExact(settings))}
            />
          ) : null}
          <div class="form-grid">
            {PANEL_RANGES.map((r) => (
              <NumberField
                key={r.path}
                id={`settings-${r.path.replace("/", "-")}`}
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
                      fieldId={`settings-${r.path.replace("/", "-")}`}
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
      <CheckField
        id="settings-lip-enabled"
        label="Locating lip on stacked trays"
        checked={settings.lip.enabled}
        hint="Without the lip, stacked trays can shift; the app then warns."
        onChange={(enabled) => onChange({ ...settings, lip: { ...settings.lip, enabled } })}
      />
      <SelectField
        id="settings-leftover"
        label="Unused space"
        value={settings.leftover}
        hint="What fills the box area the trays do not need. A spare tray is an open tray you can use for extras. A solid block is printed solid, which holds nothing and uses more filament. The same choice applies to risers and card spacers."
        options={[
          { value: "spare", label: "Spare tray (open)" },
          { value: "solid", label: "Solid filler block" },
        ]}
        onChange={(leftover) => onChange({ ...settings, leftover })}
      />
      <CheckField
        id="settings-mergeFillers"
        label="Merge fillers into one part"
        checked={settings.mergeFillers}
        hint="Fillers that touch (across the gap between trays) print as one part, the largest that fits your print bed, so there are fewer loose pieces to place by hand. Only the printed parts change: your layout and share link stay the same. A bigger part warps a little more and a failed print loses more at once."
        onChange={(mergeFillers) => onChange({ ...settings, mergeFillers })}
      />
      <CheckField
        id="settings-mergeRisers"
        label="Fold risers into the merged fillers"
        checked={settings.mergeRisers}
        disabled={!settings.mergeFillers}
        hint="Also prints the riser under a stack as part of the filler beside it: a low shelf the tray rests on with a full-height wall alongside. Fewer parts again, and the merged part goes in before the trays that rest on it. Needs merged fillers."
        onChange={(mergeRisers) => onChange({ ...settings, mergeRisers })}
      />
      <CheckField
        id="settings-engraveNumbers"
        label="Engrave part numbers"
        checked={settings.engraveNumbers}
        hint="Cuts each part's number from the assembly instructions into one of its outer walls, a shallow 0.4 mm recess you can read once the part is out of the box. Plates that go inside another part (card spacers, dividers) carry none, and a part with no room or too thin a wall is left plain. Only the printed parts change: your layout and share link stay the same."
        onChange={(engraveNumbers) => onChange({ ...settings, engraveNumbers })}
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
      <CheckField
        id="settings-oneWall"
        label="One thick wall instead of a filler"
        checked={settings.oneWall}
        hint={`Where a gap would be a filler, one wall of the neighbouring tray takes it instead, up to ${ONE_WALL_MAX_MM} mm per direction: fewer loose parts to place, but a fat wall that holds nothing and more filament. It is never a wall with a finger cut, and a bigger gap is still a filler. Replaces "Thicker walls instead of a filler" while on. Changes the layout.`}
        onChange={(oneWall) => onChange({ ...settings, oneWall })}
      />
      <CheckField
        id="settings-fillToTop"
        label="Fill the box to the top"
        checked={settings.fillToTop}
        hint="Trays are padded so every stack reaches the lid and nothing shifts when the box is carried. Turn it off for shorter trays and some empty space above them."
        onChange={(fillToTop) => onChange({ ...settings, fillToTop })}
      />
    </div>
  );
}

/** The finger room switch's hint: what it does, and a custom advanced value if there is one. */
function fingerRoomHint(s: Settings): string {
  const base = `Makes the outer walls the finger cutouts go through ${FINGER_ROOM_MM} mm and the dividers they cross ${FINGER_DIVIDER_ROOM_MM} mm thicker, so you can reach in when trays sit tight.`;
  const { wallRoom, dividerRoom } = s.fingerPocket;
  return fingerRoomOf(s) === "custom"
    ? `${base} Custom: ${wallRoom} mm walls, ${dividerRoom} mm dividers.`
    : base;
}

/**
 * Choices that write resolved numbers (spec §5): walls, fit and the finger room switch (on for
 * any wall room, including a custom one). Advanced mode also edits the numbers themselves.
 */
function SimpleChoices({ settings, onChange }: Omit<SettingsFormProps, "advanced">) {
  return (
    <>
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
      <SelectField
        id="settings-fitChoice"
        label="Fit"
        value={fitChoiceOf(settings)}
        options={fitOptions(settings)}
        hint="Scales every clearance. Pick loose if your printer's parts usually come out snug."
        onChange={(c) => {
          if (c !== "custom") {
            onChange(applyFitChoice(settings, c));
          }
        }}
      />
      <CheckField
        id="settings-fingerRoom"
        label="Extra finger room in the box"
        checked={fingerRoomOf(settings) !== false}
        hint={fingerRoomHint(settings)}
        onChange={(on) => onChange(applyFingerRoom(settings, on))}
      />
    </>
  );
}
