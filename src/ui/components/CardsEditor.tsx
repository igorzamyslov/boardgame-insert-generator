// src/ui/components/CardsEditor.tsx
// Edit's cards editor: how many (one stepper, or the decks), the card size, the sleeves; the rest is
// under More options.
import { useContext, useEffect, useState } from "preact/hooks";
import { setCardSides } from "../../app/actions";
import { ChoiceChips, CheckRow, Segmented, Stepper } from "../../kit";
import type { SegmentedOption } from "../../kit";
import { COMPONENT_DEFAULTS, flatDecksOffered } from "../../model/defaults";
import { CARD_PRESETS, SLEEVES } from "../../model/presets";
import type { CardsComponent } from "../../model/types";
import { mm } from "../identity";
import { COUNT, LENGTH, OFFSET, THICKNESS_CORRECTION } from "../limits";
import { SettingsContext } from "../validation";
import { AccessChoice, CommonRows, commonOptionPaths } from "./CommonOptions";
import { Alert, Choice, CountField, ExactRow, Group, Notes, NumField, TextBox } from "./controls";
import { GrowthOptions } from "./GrowthOptions";
import { MoreOptions } from "./MoreOptions";
import { changedOptions, flatDecksBlock } from "./moreSummary";
import { RowRemove } from "./RowRemove";
import { BinNotes, TrayShape, WellRows } from "./ToggleOptions";
import type { EditorProps } from "./types";

export const CUSTOM_SIZE = "custom";

export function cardPresetOf(c: CardsComponent): string {
  const preset = CARD_PRESETS.find((p) => p.shortSide === c.shortSide && p.longSide === c.longSide);
  return preset ? preset.id : CUSTOM_SIZE;
}

/** The sizes offered as chips on the first screen: the common ones. */
const COMMON_PRESETS = CARD_PRESETS.filter((p) => p.common === true);

/** The others, offered as chips inside "My own size" (every preset of the engine can be chosen). */
const OTHER_PRESETS = CARD_PRESETS.filter((p) => p.common !== true);

type SleeveChoice = "none" | "standard" | "premium" | "custom";

const SLEEVE_OPTIONS: SegmentedOption<SleeveChoice>[] = [
  { value: "none", label: "None" },
  { value: "standard", label: "Standard" },
  { value: "premium", label: "Premium" },
  { value: "custom", label: "Custom" },
];

const STAND_OPTIONS: SegmentedOption<CardsComponent["storage"]>[] = [
  { value: "upright-long", label: "Long edge" },
  { value: "upright-short", label: "Short edge" },
  { value: "flat", label: "Flat" },
  { value: "auto", label: "Auto" },
];

const BETWEEN_OPTIONS: SegmentedOption<NonNullable<CardsComponent["flatDecks"]>>[] = [
  { value: "walls", label: "Fixed walls" },
  { value: "dividers", label: "Removable dividers" },
];

const ANOTHER_DECK = "+ Another deck";

type Deck = CardsComponent["decks"][number];

/** Fixed walls is the default, so it is stored as nothing. */
function withoutFlatDecks(c: CardsComponent): CardsComponent {
  return Object.fromEntries(
    Object.entries(c).filter(([key]) => key !== "flatDecks"),
  ) as unknown as CardsComponent;
}

export function CardsEditor({ component: c, index, onChange }: EditorProps<CardsComponent>) {
  const at = `/components/${index}`;
  const settings = useContext(SettingsContext);
  const changed = changedOptions(c, settings);
  const matched = cardPresetOf(c);
  // "My own size" is open for a size that is no common preset: the others are chips inside it.
  const [customSize, setCustomSize] = useState(!COMMON_PRESETS.some((p) => p.id === matched));
  const sizeValue = customSize ? CUSTOM_SIZE : matched;
  const pick = (id: string): void => {
    const preset = CARD_PRESETS.find((p) => p.id === id);
    if (preset) {
      onChange(setCardSides(c, preset.shortSide, preset.longSide));
    }
  };
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
  // A control stays where it first appeared (DESIGN, Flow): "+ Another deck" sits under the stepper,
  // and under the list once it is one. The new deck's name takes the focus, so it can be typed at once.
  const [focusDeck, setFocusDeck] = useState<number | null>(null);
  useEffect(() => {
    if (focusDeck !== null && focusDeck < c.decks.length) {
      document.getElementById(`${c.id}-deck${focusDeck}-name`)?.focus();
      setFocusDeck(null);
    }
  }, [focusDeck, c.decks.length, c.id]);
  const addDeck = (
    <button
      type="button"
      class="ed-add"
      onClick={() => {
        // A lone deck carries no name (the item's name stands for it); a second deck names both.
        const first = c.decks.map((d) => (d.name === "" ? { ...d, name: "Deck 1" } : d));
        onChange({ ...c, decks: [...first, { name: `Deck ${c.decks.length + 1}`, count: 50 }] });
        setFocusDeck(c.decks.length);
      }}
    >
      {ANOTHER_DECK}
    </button>
  );
  const only = c.decks.length === 1 ? c.decks[0] : undefined;
  // An old file's lone deck keeps a name, so its field stays: it shows from the moment the editor
  // opens with a named lone deck, and stays while it is edited (even emptied), as a control stays
  // where it first appeared. A removal that leaves one deck clears the name, and the field stays away.
  const [nameField, setNameField] = useState(only !== undefined && only.name !== "");
  // Custom was just chosen: the width field takes the focus once it is drawn.
  const [focusSleeve, setFocusSleeve] = useState(false);
  useEffect(() => {
    if (focusSleeve && sleeveChoice === "custom") {
      document.getElementById(`${c.id}-sleeveW`)?.focus();
      setFocusSleeve(false);
    }
  }, [focusSleeve, sleeveChoice, c.id]);
  const sleeveCustom = (patch: Partial<typeof sleeveNow>): void =>
    onChange({ ...c, sleeve: { ...sleeveNow, ...patch } });

  return (
    <>
      {only !== undefined ? (
        <>
          <CountField
            label="How many cards?"
            name="Number of cards"
            value={only.count}
            path={`${at}/decks/0/count`}
            onChange={(count) => setDeck(0, { count })}
          />
          {nameField ? (
            <TextBox
              id={`${c.id}-deck0-name`}
              label="Deck name"
              value={only.name}
              onCommit={(name) => setDeck(0, { name })}
            />
          ) : null}
        </>
      ) : (
        <>
          <div class="ed-cards">
            {c.decks.map((deck, j) => (
              <div class="ed-card ed-card--deck" key={j}>
                <TextBox
                  id={`${c.id}-deck${j}-name`}
                  label="Deck"
                  labelExtra={`${j + 1}`}
                  value={deck.name}
                  onCommit={(name) => setDeck(j, { name })}
                />
                <span class="k-field__label">How many</span>
                <div class="ed-card__top ed-card__top--center">
                  <Stepper
                    label={`Number of cards in deck ${j + 1}`}
                    value={deck.count}
                    min={COUNT.min}
                    max={COUNT.max}
                    onChange={(count) => setDeck(j, { count })}
                  />
                  <RowRemove
                    label={`Remove deck ${deck.name === "" ? j + 1 : deck.name}`}
                    onlyOne={c.decks.length <= 1}
                    reason="There has to be at least one deck."
                    onRemove={() => {
                      const rest = c.decks.filter((_d, k) => k !== j);
                      // Left alone, a deck carries no name: the item's name stands for it.
                      const [lone] = rest;
                      setNameField(false);
                      onChange({
                        ...c,
                        decks: rest.length === 1 && lone ? [{ ...lone, name: "" }] : rest,
                      });
                    }}
                  />
                </div>
                <Alert id={`${c.id}-deck${j}-count-error`} path={`${at}/decks/${j}/count`} />
                <Notes path={`${at}/decks/${j}/count`} />
              </div>
            ))}
          </div>
        </>
      )}
      {addDeck}
      <Group label="Card size">
        <ChoiceChips
          label="Card size"
          options={[
            ...COMMON_PRESETS.map((p) => ({ value: p.id, label: p.label })),
            { value: CUSTOM_SIZE, label: "My own size" },
          ]}
          value={sizeValue}
          onChange={(id) => {
            if (id === CUSTOM_SIZE) {
              setCustomSize(true);
            } else {
              setCustomSize(false);
              pick(id);
            }
          }}
        />
        {sizeValue === CUSTOM_SIZE ? (
          <>
            <ChoiceChips
              label="Other sizes"
              options={OTHER_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
              value={OTHER_PRESETS.some((p) => p.id === matched) ? matched : ""}
              onChange={pick}
            />
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
          </>
        ) : null}
        <span class="ed-line">{`${mm(c.shortSide)} × ${mm(c.longSide)} mm`}</span>
      </Group>
      <Group label="Sleeves">
        <Segmented
          label="Sleeves"
          stretch
          options={SLEEVE_OPTIONS}
          value={sleeveChoice}
          onChange={(v) => {
            if (v === "custom") {
              // Custom starts from the size the sleeve has now, so nothing jumps; the fields open below.
              if (sleeveChoice !== "custom") {
                onChange({ ...c, sleeve: { ...sleeveNow } });
                setFocusSleeve(true);
              }
            } else {
              onChange({ ...c, sleeve: v });
            }
          }}
        />
        {sleeveChoice === "custom" ? (
          <>
            <div class="ed-pair">
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
            </div>
            <NumField
              id={`${c.id}-sleeveT`}
              label="Added thickness per card"
              unit="mm"
              value={sleeveNow.thickness}
              path={`${at}/sleeve/thickness`}
              {...OFFSET}
              onCommit={(thickness) => sleeveCustom({ thickness })}
            />
          </>
        ) : null}
      </Group>
      <BinNotes component={c} index={index} />
      <MoreOptions
        component={c}
        errorPaths={[
          ...commonOptionPaths(index),
          `${at}/flatDecks`,
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
          revert={
            c.storage === COMPONENT_DEFAULTS.cards.storage
              ? undefined
              : {
                  to:
                    STAND_OPTIONS.find((o) => o.value === COMPONENT_DEFAULTS.cards.storage)
                      ?.label ?? "Auto",
                  onBack: () => onChange({ ...c, storage: COMPONENT_DEFAULTS.cards.storage }),
                }
          }
        />
        {flatDecksOffered(c) ? (
          <ExactRow
            title="Between decks"
            meta={c.flatDecks === "dividers" ? "Removable dividers" : "Fixed walls"}
            errorPaths={[`${at}/flatDecks`]}
            blockedReason={flatDecksBlock(c)}
            revert={
              c.flatDecks === "dividers"
                ? { to: "Fixed walls", onBack: () => onChange(withoutFlatDecks(c)) }
                : undefined
            }
          >
            <Segmented
              label="Between decks"
              stretch
              options={BETWEEN_OPTIONS}
              value={c.flatDecks ?? "walls"}
              onChange={(v) =>
                onChange(v === "walls" ? withoutFlatDecks(c) : { ...c, flatDecks: v })
              }
            />
            <Alert id={`${c.id}-flatDecks-error`} path={`${at}/flatDecks`} />
          </ExactRow>
        ) : null}
        <TrayShape component={c} index={index} onChange={onChange} />
        <ExactRow
          title="Card thickness"
          hint="From the sleeve table. Measure your stack if decks come out tight."
          errorPaths={[`${at}/thickness/scale`, `${at}/thickness/cards`, `${at}/thickness/stackMm`]}
          revert={
            changed.has("thickness")
              ? {
                  to: "the sleeve table",
                  onBack: () => onChange({ ...c, thickness: { mode: "preset" } }),
                }
              : undefined
          }
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
        <WellRows component={c} index={index} onChange={onChange} />
        <CommonRows component={c} index={index} onChange={onChange} />
      </MoreOptions>
    </>
  );
}
