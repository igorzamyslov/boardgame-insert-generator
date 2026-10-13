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
            {SETTING_RANGES.map((r) => (
              <NumberField
                key={r.path}
                id={`settings-${r.path.replace("/", "-")}`}
                label={r.label}
                unit={settingUnit(r.path)}
                value={r.get(settings)}
                path={`/settings/${r.path}`}
                min={r.min}
                max={r.max}
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
        options={[
          { value: "spare", label: "Spare tray (open)" },
          { value: "solid", label: "Solid filler block" },
        ]}
        onChange={(leftover) => onChange({ ...settings, leftover })}
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
