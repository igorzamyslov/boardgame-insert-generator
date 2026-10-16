// src/ui/components/CardsEditor.tsx
import { useState } from "preact/hooks";
import { setCardSides } from "../../app/actions";
import { CARD_PRESETS } from "../../model/presets";
import type { CardsComponent } from "../../model/types";
import { CheckField, SelectField, TextField } from "../fields";
import type { SelectOption } from "../fields";
import { COUNT, LENGTH, OFFSET, THICKNESS_CORRECTION } from "../limits";
import { NumberField } from "../NumberField";
import { CommonOptions, commonOptionPaths } from "./CommonOptions";
import { DerivedSizes } from "./DerivedSizes";
import { ListNotices } from "./ListNotices";
import { MoreOptions } from "./MoreOptions";
import { BinNotes, ToggleOptions } from "./ToggleOptions";
import type { EditorProps } from "./types";

export const CUSTOM_SIZE = "custom";

export function cardPresetOf(c: CardsComponent): string {
  const preset = CARD_PRESETS.find((p) => p.shortSide === c.shortSide && p.longSide === c.longSide);
  return preset ? preset.id : CUSTOM_SIZE;
}

const sizeLabel = (p: (typeof CARD_PRESETS)[number]): string =>
  `${p.label} (${p.shortSide} × ${p.longSide} mm)`;

/** The common sizes first, then the rest from the smallest card to the largest. */
const SIZE_OPTIONS: SelectOption<string>[] = [
  ...CARD_PRESETS.filter((p) => p.common === true).map((p) => ({
    value: p.id,
    label: sizeLabel(p),
    group: "Common sizes",
  })),
  ...CARD_PRESETS.filter((p) => p.common !== true)
    .sort((a, b) => a.shortSide - b.shortSide || a.longSide - b.longSide)
    .map((p) => ({ value: p.id, label: sizeLabel(p), group: "Other sizes, smallest first" })),
  { value: CUSTOM_SIZE, label: "Custom size", group: "Other sizes, smallest first" },
];

type SleeveChoice = "none" | "standard" | "premium" | "custom";

const SLEEVE_OPTIONS: SelectOption<SleeveChoice>[] = [
  { value: "none", label: "No sleeves" },
  { value: "standard", label: "Standard sleeves" },
  { value: "premium", label: "Premium sleeves (thick)" },
  { value: "custom", label: "Custom sleeves" },
];

const STORAGE_OPTIONS: SelectOption<CardsComponent["storage"]>[] = [
  { value: "auto", label: "Let the optimizer choose" },
  { value: "upright-long", label: "Upright, standing on the long edge" },
  { value: "upright-short", label: "Upright, standing on the short edge" },
  { value: "flat", label: "Lying flat" },
];

export function CardsEditor({
  component: c,
  index,
  advanced,
  onChange,
}: EditorProps<CardsComponent>) {
  const at = `/components/${index}`;
  const matched = cardPresetOf(c);
  const [customSize, setCustomSize] = useState(matched === CUSTOM_SIZE);
  const sizeValue = customSize ? CUSTOM_SIZE : matched;
  const customSleeve = typeof c.sleeve === "object" ? c.sleeve : null;
  const sleeveChoice: SleeveChoice = typeof c.sleeve === "object" ? "custom" : c.sleeve;
  const measured = c.thickness.mode === "measured" ? c.thickness : null;
  const scale = c.thickness.mode === "preset" ? (c.thickness.scale ?? 1) : 1;

  const setDeck = (j: number, patch: Partial<CardsComponent["decks"][number]>): void => {
    onChange({ ...c, decks: c.decks.map((d, k) => (k === j ? { ...d, ...patch } : d)) });
  };

  return (
    <>
      <SelectField
        id={`${c.id}-size`}
        label="Card size"
        value={sizeValue}
        options={SIZE_OPTIONS}
        hint="The card itself, not the sleeve."
        onChange={(id) => {
          const preset = CARD_PRESETS.find((p) => p.id === id);
          if (preset) {
            setCustomSize(false);
            onChange(setCardSides(c, preset.shortSide, preset.longSide));
          } else {
            setCustomSize(true);
          }
        }}
      />
      {sizeValue === CUSTOM_SIZE ? (
        <>
          <NumberField
            id={`${c.id}-shortSide`}
            label="Short side"
            unit="mm"
            value={c.shortSide}
            path={`${at}/shortSide`}
            {...LENGTH}
            commitOn="blur"
            onCommit={(v) => onChange(setCardSides(c, v, c.longSide))}
          />
          <NumberField
            id={`${c.id}-longSide`}
            label="Long side"
            unit="mm"
            value={c.longSide}
            path={`${at}/longSide`}
            {...LENGTH}
            commitOn="blur"
            onCommit={(v) => onChange(setCardSides(c, c.shortSide, v))}
          />
        </>
      ) : null}
      <SelectField
        id={`${c.id}-sleeve`}
        label="Sleeves"
        value={sleeveChoice}
        options={SLEEVE_OPTIONS}
        hint="Standard adds 3 mm to both card sides and 0.1 mm per card; premium adds 3 mm and 0.28 mm per card. Pick custom to enter your sleeve's outer size."
        onChange={(v) => {
          if (v === "custom") {
            if (!customSleeve) {
              onChange({ ...c, sleeve: { w: c.shortSide + 3, h: c.longSide + 3, thickness: 0.1 } });
            }
          } else {
            onChange({ ...c, sleeve: v });
          }
        }}
      />
      {customSleeve ? (
        <>
          <NumberField
            id={`${c.id}-sleeveW`}
            label="Sleeve outer width"
            hint="Width of the sleeved card, measured over the sleeve."
            unit="mm"
            value={customSleeve.w}
            path={`${at}/sleeve/w`}
            {...LENGTH}
            onCommit={(v) => onChange({ ...c, sleeve: { ...customSleeve, w: v } })}
          />
          <NumberField
            id={`${c.id}-sleeveH`}
            label="Sleeve outer length"
            hint="Length of the sleeved card, measured over the sleeve."
            unit="mm"
            value={customSleeve.h}
            path={`${at}/sleeve/h`}
            {...LENGTH}
            onCommit={(v) => onChange({ ...c, sleeve: { ...customSleeve, h: v } })}
          />
          <NumberField
            id={`${c.id}-sleeveT`}
            label="Added thickness per card"
            hint="How much one sleeve adds to the card's own thickness."
            unit="mm"
            value={customSleeve.thickness}
            path={`${at}/sleeve/thickness`}
            {...OFFSET}
            onCommit={(v) => onChange({ ...c, sleeve: { ...customSleeve, thickness: v } })}
          />
        </>
      ) : null}
      <fieldset class="list-rows">
        <legend>Decks</legend>
        <ListNotices id={`${c.id}-decks`} path={`${at}/decks`} />
        {c.decks.map((deck, j) => (
          <div class="list-row" key={j}>
            <TextField
              id={`${c.id}-deck${j}-name`}
              label={`Name of deck ${j + 1}`}
              value={deck.name}
              onCommit={(name) => setDeck(j, { name })}
            />
            <NumberField
              id={`${c.id}-deck${j}-count`}
              label={`Cards in deck ${j + 1}`}
              value={deck.count}
              {...COUNT}
              path={`${at}/decks/${j}/count`}
              onCommit={(count) => setDeck(j, { count })}
            />
            <button
              type="button"
              class="row-remove"
              aria-label={`Remove deck ${deck.name === "" ? j + 1 : deck.name}`}
              disabled={c.decks.length <= 1}
              onClick={() => onChange({ ...c, decks: c.decks.filter((_d, k) => k !== j) })}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...c,
              decks: [...c.decks, { name: `Deck ${c.decks.length + 1}`, count: 50 }],
            })
          }
        >
          Add deck
        </button>
      </fieldset>
      <BinNotes component={c} index={index} />
      <DerivedSizes component={c} index={index} />
      <MoreOptions
        errorPaths={[
          ...commonOptionPaths(index),
          `${at}/thickness/scale`,
          `${at}/thickness/cards`,
          `${at}/thickness/stackMm`,
        ]}
      >
        <CommonOptions
          component={c}
          index={index}
          onChange={onChange}
          pieces={
            <>
              {measured ? null : (
                <NumberField
                  id={`${c.id}-thicknessCorrection`}
                  label="Correct the estimated thickness"
                  hint="Is a deck thicker or thinner than the sizes above say? Enter how far off the thickness per card is: 10 if the real deck is 10 % thicker, -10 if 10 % thinner. This corrects the estimate itself; Fit and the card stack clearance only add room around it. To measure instead, tick the box below."
                  unit="%"
                  value={Math.round((scale - 1) * 10000) / 100}
                  path={`${at}/thickness/scale`}
                  {...THICKNESS_CORRECTION}
                  onCommit={(pct) =>
                    onChange({
                      ...c,
                      thickness:
                        pct === 0
                          ? { mode: "preset" }
                          : { mode: "preset", scale: Math.round((1 + pct / 100) * 10000) / 10000 },
                    })
                  }
                />
              )}
              <CheckField
                id={`${c.id}-measured`}
                label="Measure a stack of cards (sleeves included)"
                checked={measured !== null}
                hint="More exact than the sleeve table or a correction: count some cards, measure the stack. It replaces the correction above."
                onChange={(on) =>
                  onChange({
                    ...c,
                    thickness: on
                      ? { mode: "measured", cards: 50, stackMm: 20 }
                      : { mode: "preset" },
                  })
                }
              />
              {measured ? (
                <>
                  <NumberField
                    id={`${c.id}-measuredCards`}
                    label="Cards in the measured stack"
                    hint="How many cards you counted into the stack you measured."
                    value={measured.cards}
                    {...COUNT}
                    path={`${at}/thickness/cards`}
                    onCommit={(cards) => onChange({ ...c, thickness: { ...measured, cards } })}
                  />
                  <NumberField
                    id={`${c.id}-measuredMm`}
                    label="Height of that stack"
                    hint="Measured with the sleeves on, pressed lightly. The thickness per card is this divided by the count."
                    unit="mm"
                    value={measured.stackMm}
                    path={`${at}/thickness/stackMm`}
                    {...LENGTH}
                    onCommit={(stackMm) => onChange({ ...c, thickness: { ...measured, stackMm } })}
                  />
                </>
              ) : null}
            </>
          }
          tray={
            <>
              <SelectField
                id={`${c.id}-storage`}
                label="Storage"
                value={c.storage}
                options={STORAGE_OPTIONS}
                hint="How the decks stand in the tray. Upright decks stand on the long or the short edge; flat decks lie in stacks. The optimizer tries every orientation and keeps the one that packs best."
                onChange={(storage) => onChange({ ...c, storage })}
              />
              <ToggleOptions component={c} index={index} advanced={advanced} onChange={onChange} />
            </>
          }
        />
      </MoreOptions>
    </>
  );
}
