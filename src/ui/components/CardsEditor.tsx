// src/ui/components/CardsEditor.tsx
// Edit's cards editor: how many, the card size, the sleeves; the rest is under More options.
import { useState } from "preact/hooks";
import { setCardSides } from "../../app/actions";
import { ChoiceChips, CheckRow, Segmented } from "../../kit";
import type { SegmentedOption } from "../../kit";
import { CARD_PRESETS, SLEEVES } from "../../model/presets";
import type { CardsComponent } from "../../model/types";
import { mm } from "../identity";
import { COUNT, LENGTH, OFFSET, THICKNESS_CORRECTION } from "../limits";
import { AccessChoice, CommonRows, commonOptionPaths } from "./CommonOptions";
import { Choice, CountField, ExactRow, Group, NumField, TextBox } from "./controls";
import { GrowthOptions } from "./GrowthOptions";
import { MoreOptions } from "./MoreOptions";
import { moreSummary } from "./moreSummary";
import { RowRemove } from "./RowRemove";
import { BinNotes, TrayShape, WellRows } from "./ToggleOptions";
import type { EditorProps } from "./types";

export const CUSTOM_SIZE = "custom";

export function cardPresetOf(c: CardsComponent): string {
  const preset = CARD_PRESETS.find((p) => p.shortSide === c.shortSide && p.longSide === c.longSide);
  return preset ? preset.id : CUSTOM_SIZE;
}

/** The sizes offered as chips: the common ones, and the one a file set when it is not among them. */
function chipPresets(chosen: string): (typeof CARD_PRESETS)[number][] {
  return CARD_PRESETS.filter((p) => p.common === true || p.id === chosen);
}

type SleeveChoice = "none" | "standard" | "premium" | "custom";

const SLEEVE_OPTIONS: SegmentedOption<SleeveChoice>[] = [
  { value: "none", label: "None" },
  { value: "standard", label: "Standard" },
  { value: "premium", label: "Premium" },
];

const STAND_OPTIONS: SegmentedOption<CardsComponent["storage"]>[] = [
  { value: "upright-long", label: "Long edge" },
  { value: "upright-short", label: "Short edge" },
  { value: "flat", label: "Flat" },
  { value: "auto", label: "Auto" },
];

const ANOTHER_DECK = "+ Another deck";

type Deck = CardsComponent["decks"][number];

export function CardsEditor({ component: c, index, onChange }: EditorProps<CardsComponent>) {
  const at = `/components/${index}`;
  const matched = cardPresetOf(c);
  const [customSize, setCustomSize] = useState(matched === CUSTOM_SIZE);
  const sizeValue = customSize ? CUSTOM_SIZE : matched;
  const sleeveChoice: SleeveChoice = typeof c.sleeve === "object" ? "custom" : c.sleeve;
  const sleeveNow =
    typeof c.sleeve === "object"
      ? c.sleeve
      : {
          w: c.shortSide + SLEEVES[c.sleeve].addSize,
          h: c.longSide + SLEEVES[c.sleeve].addSize,
          thickness: SLEEVES[c.sleeve].addThickness,
        };
  const measured = c.thickness.mode === "measured" ? c.thickness : null;
  const scale = c.thickness.mode === "preset" ? (c.thickness.scale ?? 1) : 1;

  const setDeck = (j: number, patch: Partial<Deck>): void => {
    onChange({ ...c, decks: c.decks.map((d, k) => (k === j ? { ...d, ...patch } : d)) });
  };
  const addDeck = (
    <button
      type="button"
      class="ed-add"
      onClick={() =>
        onChange({ ...c, decks: [...c.decks, { name: `Deck ${c.decks.length + 1}`, count: 50 }] })
      }
    >
      {ANOTHER_DECK}
    </button>
  );
  const only = c.decks.length === 1 ? c.decks[0] : undefined;
  const sleeveCustom = (patch: Partial<typeof sleeveNow>): void =>
    onChange({ ...c, sleeve: { ...sleeveNow, ...patch } });

  return (
    <>
      {only !== undefined ? (
        <CountField
          label="How many cards?"
          name="Number of cards"
          value={only.count}
          path={`${at}/decks/0/count`}
          onChange={(count) => setDeck(0, { count })}
        />
      ) : (
        <>
          <div class="ed-cards">
            {c.decks.map((deck, j) => (
              <div class="ed-card" key={j}>
                <div class="ed-card__top">
                  <TextBox
                    class="ed-grow"
                    id={`${c.id}-deck${j}-name`}
                    label="Deck"
                    labelExtra={`${j + 1}`}
                    value={deck.name}
                    onCommit={(name) => setDeck(j, { name })}
                  />
                  <NumField
                    class="ed-count"
                    id={`${c.id}-deck${j}-count`}
                    label="How many"
                    labelExtra={`in deck ${j + 1}`}
                    value={deck.count}
                    {...COUNT}
                    path={`${at}/decks/${j}/count`}
                    onCommit={(count) => setDeck(j, { count })}
                  />
                  <RowRemove
                    label={`Remove deck ${deck.name === "" ? j + 1 : deck.name}`}
                    onlyOne={c.decks.length <= 1}
                    reason="There has to be at least one deck."
                    onRemove={() => onChange({ ...c, decks: c.decks.filter((_d, k) => k !== j) })}
                  />
                </div>
              </div>
            ))}
          </div>
          {addDeck}
        </>
      )}
      <Group label="Card size">
        <ChoiceChips
          label="Card size"
          options={[
            ...chipPresets(sizeValue).map((p) => ({ value: p.id, label: p.label })),
            { value: CUSTOM_SIZE, label: "My own size" },
          ]}
          value={sizeValue}
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
          <div class="ed-pair">
            <NumField
              id={`${c.id}-shortSide`}
              label="Short side"
              unit="mm"
              value={c.shortSide}
              path={`${at}/shortSide`}
              {...LENGTH}
              commitOn="blur"
              onCommit={(v) => onChange(setCardSides(c, v, c.longSide))}
            />
            <NumField
              id={`${c.id}-longSide`}
              label="Long side"
              unit="mm"
              value={c.longSide}
              path={`${at}/longSide`}
              {...LENGTH}
              commitOn="blur"
              onCommit={(v) => onChange(setCardSides(c, c.shortSide, v))}
            />
          </div>
        ) : null}
        <span class="ed-line">{`${mm(c.shortSide)} × ${mm(c.longSide)} mm`}</span>
      </Group>
      <Group label="Sleeves">
        <Segmented
          label="Sleeves"
          stretch
          options={
            sleeveChoice === "custom"
              ? [...SLEEVE_OPTIONS, { value: "custom", label: "Custom" }]
              : SLEEVE_OPTIONS
          }
          value={sleeveChoice}
          onChange={(v) => {
            if (v !== "custom") {
              onChange({ ...c, sleeve: v });
            }
          }}
        />
      </Group>
      <BinNotes component={c} index={index} />
      <MoreOptions
        summary={moreSummary(c)}
        errorPaths={[
          ...commonOptionPaths(index),
          `${at}/sleeve`,
          `${at}/thickness/scale`,
          `${at}/thickness/cards`,
          `${at}/thickness/stackMm`,
        ]}
      >
        <GrowthOptions component={c} index={index} onChange={onChange} />
        <AccessChoice component={c} index={index} onChange={onChange} />
        <Choice
          label="Cards stand"
          options={STAND_OPTIONS}
          value={c.storage}
          onChange={(storage) => onChange({ ...c, storage })}
        />
        <TrayShape component={c} index={index} onChange={onChange} />
        <ExactRow
          title="Card thickness"
          hint="From the sleeve table. Measure your stack if decks come out tight."
          errorPaths={[`${at}/thickness/scale`, `${at}/thickness/cards`, `${at}/thickness/stackMm`]}
        >
          {measured ? null : (
            <NumField
              id={`${c.id}-thicknessCorrection`}
              label="Correct the estimated thickness"
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
          <CheckRow
            label="Measure a stack of cards (sleeves included)"
            checked={measured !== null}
            onChange={(on) =>
              onChange({
                ...c,
                thickness: on ? { mode: "measured", cards: 50, stackMm: 20 } : { mode: "preset" },
              })
            }
          />
          {measured ? (
            <>
              <NumField
                id={`${c.id}-measuredCards`}
                label="Cards in the measured stack"
                value={measured.cards}
                {...COUNT}
                path={`${at}/thickness/cards`}
                onCommit={(cards) => onChange({ ...c, thickness: { ...measured, cards } })}
              />
              <NumField
                id={`${c.id}-measuredMm`}
                label="Height of that stack"
                unit="mm"
                value={measured.stackMm}
                path={`${at}/thickness/stackMm`}
                {...LENGTH}
                onCommit={(stackMm) => onChange({ ...c, thickness: { ...measured, stackMm } })}
              />
            </>
          ) : null}
        </ExactRow>
        <ExactRow title="Sleeve size" errorPaths={[`${at}/sleeve`]}>
          <NumField
            id={`${c.id}-sleeveW`}
            label="Sleeve outer width"
            unit="mm"
            value={sleeveNow.w}
            path={`${at}/sleeve/w`}
            {...LENGTH}
            onCommit={(w) => sleeveCustom({ w })}
          />
          <NumField
            id={`${c.id}-sleeveH`}
            label="Sleeve outer length"
            unit="mm"
            value={sleeveNow.h}
            path={`${at}/sleeve/h`}
            {...LENGTH}
            onCommit={(h) => sleeveCustom({ h })}
          />
          <NumField
            id={`${c.id}-sleeveT`}
            label="Added thickness per card"
            unit="mm"
            value={sleeveNow.thickness}
            path={`${at}/sleeve/thickness`}
            {...OFFSET}
            onCommit={(thickness) => sleeveCustom({ thickness })}
          />
        </ExactRow>
        <WellRows component={c} index={index} onChange={onChange} />
        {only !== undefined ? (
          <ExactRow title="Decks">
            <TextBox
              id={`${c.id}-deck0-name`}
              label="Deck"
              labelExtra="1"
              value={only.name}
              onCommit={(name) => setDeck(0, { name })}
            />
            {addDeck}
          </ExactRow>
        ) : null}
        <CommonRows component={c} index={index} onChange={onChange} />
      </MoreOptions>
    </>
  );
}
