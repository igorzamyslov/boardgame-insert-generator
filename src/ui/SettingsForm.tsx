// src/ui/SettingsForm.tsx
import {
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
import { SETTING_RANGES } from "../model/validate";
import { CheckField, SelectField } from "./fields";
import type { SelectOption } from "./fields";
import { NumberField } from "./NumberField";
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
const wallAbsorbRange = SETTING_RANGES.find((r) => r.path === WALL_ABSORB_PATH);

export function SettingsForm({ settings, advanced, onChange }: SettingsFormProps) {
  if (!advanced) {
    return (
      <div class="form-grid">
        <SimpleChoices settings={settings} onChange={onChange} />
      </div>
    );
  }
  return (
    <div class="form-grid">
      <SimpleChoices settings={settings} onChange={onChange} />
      <details class="pf-disc">
        <summary>Exact values</summary>
        <div class="pf-disc__body">
          <div class="form-grid">
            {SETTING_RANGES.filter((r) => r.path !== WALL_ABSORB_PATH).map((r) => (
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
