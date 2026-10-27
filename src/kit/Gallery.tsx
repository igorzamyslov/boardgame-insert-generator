// src/kit/Gallery.tsx
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { chooseTheme, themePref } from "../ui/theme";
import type { ThemeChoice } from "../ui/theme";
import {
  Button,
  Card,
  CheckRow,
  ChoiceChips,
  CloseButton,
  Dialog,
  Disclosure,
  DisclosureRow,
  Drawer,
  Field,
  Icon,
  IconButton,
  IconTile,
  KindTile,
  ListRow,
  MenuItem,
  MenuPanel,
  MenuSeparator,
  Notice,
  ProgressBar,
  RuleChip,
  SearchField,
  Segmented,
  Sheet,
  StatusHeading,
  StepBadge,
  Stepper,
  Toast,
  ToastNote,
} from "./index";

/** Every primitive the gallery shows, in the order it shows them. */
export const PRIMITIVES = [
  "Button",
  "IconButton",
  "Field",
  "Stepper",
  "Segmented",
  "ChoiceChips",
  "CheckRow",
  "KindTile",
  "IconTile",
  "ListRow",
  "RuleChip",
  "Card",
  "StatusHeading",
  "Notice",
  "Toast",
  "Disclosure",
  "DisclosureRow",
  "ProgressBar",
  "SearchField",
  "StepBadge",
  "MenuPanel",
  "Dialog",
  "Drawer",
  "Sheet",
];

function Section(p: { name: string; note?: string; region?: string; children: ComponentChildren }) {
  return (
    <section class="gal__section" data-primitive={p.name} data-region={p.region}>
      <h2 class="gal__name">{p.name}</h2>
      {p.note !== undefined ? <p class="gal__note">{p.note}</p> : null}
      <div class="gal__body">{p.children}</div>
    </section>
  );
}

function Row(p: { label?: string; children: ComponentChildren }) {
  return (
    <div class="gal__row">
      {p.label !== undefined ? <span class="gal__label">{p.label}</span> : null}
      <div class="gal__items">{p.children}</div>
    </div>
  );
}

const SLEEVES = [
  { value: "none", label: "None" },
  { value: "standard", label: "Standard" },
  { value: "premium", label: "Premium" },
];
const LAYERS = [
  { value: "bottom", label: "Bottom layer · 40 mm" },
  { value: "top", label: "Top layer · 26 mm" },
];
const VIEWS = [
  { value: "top", label: "Top" },
  { value: "3d", label: "3D" },
];
const WALLS = [
  { value: "light", label: "Light" },
  { value: "standard", label: "Standard" },
  { value: "sturdy", label: "Sturdy" },
  { value: "custom", label: "Custom", changed: true },
];
const CARD_SIZES = [
  { value: "standard", label: "Standard" },
  { value: "mini", label: "Mini" },
  { value: "tarot", label: "Tarot" },
  { value: "square", label: "Square" },
  { value: "own", label: "My own size" },
];
const SHAPES = [
  { value: "stands", label: "Stands upright" },
  { value: "cuts", label: "Finger cuts" },
  { value: "deep", label: "Deep" },
];

function Pick<T extends string>(p: {
  label: string;
  options: readonly { value: T; label: string; blockedReason?: string }[];
  start: T;
  tone?: "quiet" | "track";
  stretch?: boolean;
}) {
  const [value, setValue] = useState<T>(p.start);
  return (
    <Segmented
      label={p.label}
      options={p.options}
      value={value}
      onChange={setValue}
      tone={p.tone}
      stretch={p.stretch}
    />
  );
}

function CountDemo() {
  const [n, setN] = useState(80);
  return <Stepper label="Number of cards" value={n} min={1} max={500} onChange={setN} />;
}

function FieldDemo(p: { id: string; label: string; start: string; error?: string }) {
  const [text, setText] = useState(p.start);
  return (
    <Field id={p.id} label={p.label} value={text} unit="mm" onInput={setText} error={p.error} />
  );
}

function SizeChips() {
  const [size, setSize] = useState("standard");
  return <ChoiceChips label="Card size" options={CARD_SIZES} value={size} onChange={setSize} />;
}

function ShapeChips() {
  const [on, setOn] = useState<readonly string[]>(["stands"]);
  return (
    <ChoiceChips
      label="Tray shape"
      options={SHAPES}
      value={on}
      onChange={(v) => setOn(on.includes(v) ? on.filter((x) => x !== v) : [...on, v])}
    />
  );
}

function Checks() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(true);
  const [c, setC] = useState(false);
  return (
    <>
      <CheckRow
        label="Room for fingers"
        hint="Extra space beside the walls to grab trays"
        checked={a}
        onChange={setA}
      />
      <CheckRow
        label="Top layer stays put"
        hint="A small rim on each tray stops the top layer from sliding"
        checked={b}
        onChange={setB}
      />
      <CheckRow
        label="Fill to the lid"
        hint="Fills the box up to the lid if it is stored on its side"
        checked={c}
        onChange={setC}
      />
      <CheckRow label="Engrave tray names" checked compact onChange={() => undefined} />
    </>
  );
}

function Rows() {
  const [on, setOn] = useState("market");
  const rows = [
    { id: "market", kind: "cards", name: "Market deck", meta: "80 cards, sleeved · bottom layer" },
    { id: "starter", kind: "cards", name: "Starter decks", meta: "4 decks of 12 · bottom layer" },
    {
      id: "coins",
      kind: "bulk",
      name: "Coins and cubes",
      meta: "4 kinds, 96 pieces · bottom layer",
    },
    { id: "hex", kind: "tiles", name: "Hex tiles", meta: "24 tiles · bottom layer" },
    { id: "heroes", kind: "minis", name: "Heroes", meta: "6 figures · bottom layer" },
  ] as const;
  return (
    <div class="gal__list">
      {rows.map((r) => (
        <ListRow
          key={r.id}
          kind={r.kind}
          name={r.name}
          meta={r.meta}
          selected={on === r.id}
          lit={r.id === "coins"}
          onClick={() => setOn(r.id)}
          after={
            r.id === "market" ? (
              <RuleChip aria-label="Unpin Market deck and the trays on it">Pinned</RuleChip>
            ) : r.id === "heroes" ? (
              <RuleChip aria-label="Unpin Heroes and the trays on it">Pinned, turned</RuleChip>
            ) : undefined
          }
        />
      ))}
      <div class="gal__narrow">
        <ListRow
          kind="cards"
          name="Resource tokens for the long winter market and its harbour"
          meta="6 kinds, 120 pieces · top layer"
        />
      </div>
    </div>
  );
}

function NoteDemo() {
  const [note, setNote] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setNonce(nonce + 1);
          setNote("Finger cuts added.");
        }}
      >
        Show a note
      </Button>
      <Toast message={note} nonce={nonce} onDone={() => setNote(null)} />
    </>
  );
}

function DisclosureDemo() {
  return (
    <>
      <Disclosure title="More options" summary="Finger cuts on, stands upright">
        <Pick label="Room for more cards" options={SLEEVES} start="none" stretch />
      </Disclosure>
      <Disclosure title="More options" summary="Finger cuts on, stands upright" open>
        <Pick label="How often you reach for it" options={SLEEVES} start="standard" stretch />
      </Disclosure>
    </>
  );
}

function DialogDemo() {
  const [open, setOpen] = useState<"none" | "dialog" | "drawer">("none");
  return (
    <>
      <Row>
        <Button onClick={() => setOpen("dialog")}>Open the dialog</Button>
        <Button onClick={() => setOpen("drawer")}>Open the drawer</Button>
      </Row>
      {open === "dialog" ? (
        <Dialog labelledBy="gal-dialog-live" onClose={() => setOpen("none")}>
          <div class="gal__dialog-head">
            <h2 id="gal-dialog-live" tabIndex={-1}>
              Ready to print
            </h2>
            <CloseButton onClick={() => setOpen("none")} />
          </div>
          <Button variant="primary" size="cta" icon={<Icon name="download" />}>
            Download the 3MF file
          </Button>
        </Dialog>
      ) : null}
      {open === "drawer" ? (
        <Drawer labelledBy="gal-drawer-live" onClose={() => setOpen("none")}>
          <div class="gal__drawer-head">
            <h2 id="gal-drawer-live" tabIndex={-1}>
              Settings
            </h2>
            <CloseButton onClick={() => setOpen("none")} />
          </div>
        </Drawer>
      ) : null}
    </>
  );
}

function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div class="gal__phone">
      <Sheet
        label="What's inside"
        title="What's inside"
        meta="8"
        peek
        expanded={open}
        onExpandedChange={setOpen}
        action={<Button icon={<Icon name="plus" size={14} />}>Add</Button>}
      >
        <ListRow kind="cards" name="Market deck" meta="80 cards" />
        <ListRow kind="cards" name="Starter decks" meta="4 decks" />
        <ListRow kind="bulk" name="Coins and cubes" meta="96 pieces" />
      </Sheet>
    </div>
  );
}

/** Every primitive of the kit in each state the boards show (blocked, pressed, error, each tone). Dev only: /kit.html. */
export function Gallery() {
  return (
    <main class="gal">
      <header class="gal__head">
        <h1>Kit gallery</h1>
        <p>Every primitive in each state the boards show. For development only.</p>
        <Segmented<ThemeChoice>
          label="Appearance"
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          value={themePref.value}
          onChange={chooseTheme}
        />
      </header>
      <div class="gal__grid">
        <Section
          name="Button"
          note="Primary, secondary, quiet and soft; 44, 48 and 54 px; blocked."
        >
          <Row label="Variants">
            <Button variant="primary">Done</Button>
            <Button variant="secondary">Try another arrangement</Button>
            <Button variant="quiet">Reset all</Button>
            <Button variant="soft" icon={<Icon name="pin" size={15} />}>
              Pin
            </Button>
          </Row>
          <Row label="With an icon">
            <Button variant="primary" icon={<Icon name="download" size={16} />}>
              Download
            </Button>
            <Button icon={<Icon name="plus" size={14} />}>Add</Button>
            <Button icon={<Icon name="search" size={16} />}>Try another arrangement</Button>
          </Row>
          <Row label="Blocked">
            <Button variant="primary" blockedReason="Fix the fit to download">
              Fix the fit to download
            </Button>
            <Button
              variant="soft"
              icon={<Icon name="turn" size={15} />}
              blockedReason="It does not fit that way"
            >
              Turn 90°
            </Button>
          </Row>
          <Row label="Dialog size, 48 px">
            <Button variant="primary" size="dialog">
              Stop
            </Button>
            <Button size="dialog">Try again</Button>
          </Row>
          <Row label="Call to action, 54 px">
            <Button variant="primary" size="cta" icon={<Icon name="download" />}>
              Download the 3MF file
            </Button>
          </Row>
        </Section>

        <Section name="IconButton" note="44 px round; plain, outlined, soft and primary; the dot.">
          <Row>
            <IconButton label="Undo" icon={<Icon name="undo" />} />
            <IconButton label="Project menu" variant="outlined" icon={<Icon name="more" />} />
            <IconButton label="Project menu" variant="outlined" dot icon={<Icon name="more" />} />
            <CloseButton />
            <IconButton
              label="Download"
              variant="primary"
              icon={<Icon name="download" size={20} />}
            />
            <IconButton
              label="Fewer"
              variant="outlined"
              icon={<Icon name="minus" size={14} />}
              blockedReason="That is the fewest it can be."
            />
          </Row>
        </Section>

        <Section name="Field" note="48 px, radius 12, a unit, an error.">
          <div class="gal__fields">
            <FieldDemo id="gal-width" label="Width" start="285" />
            <FieldDemo id="gal-length" label="Length" start="285" />
            <FieldDemo
              id="gal-height"
              label="Height"
              start="7"
              error="That box is 7 mm high, too shallow for any tray."
            />
          </div>
        </Section>

        <Section name="Stepper" note="Edit's How many: Fewer, the count, More.">
          <Row label="80 cards">
            <CountDemo />
          </Row>
          <Row label="At the lowest count">
            <Stepper label="Number of cards" value={1} min={1} onChange={() => undefined} />
          </Row>
        </Section>

        <Section name="Segmented" note="Quiet and track tones; the pressed option is the thumb.">
          <Row label="Quiet, stretched">
            <Pick label="Sleeves" options={SLEEVES} start="standard" stretch />
          </Row>
          <Row label="Quiet, four options">
            <Pick label="Walls" options={WALLS} start="custom" stretch />
          </Row>
          <Row label="Track">
            <Pick label="Layer" options={LAYERS} start="bottom" tone="track" />
            <Pick label="View" options={VIEWS} start="top" tone="track" />
          </Row>
          <Row label="Track, one option blocked (no WebGL)">
            <Pick
              label="View without WebGL"
              options={[
                VIEWS[0] as (typeof VIEWS)[number],
                { ...(VIEWS[1] as (typeof VIEWS)[number]), blockedReason: "3D needs WebGL" },
              ]}
              start="top"
              tone="track"
            />
          </Row>
        </Section>

        <Section name="ChoiceChips" note="Pressed pills: one chosen, or several.">
          <Row label="One">
            <SizeChips />
          </Row>
          <Row label="Several">
            <ShapeChips />
          </Row>
          <Row label="Changed">
            <ChoiceChips
              label="Tray shape, one chip changed"
              options={SHAPES.map((o, i) => ({ ...o, changed: i === 0 }))}
              value={[SHAPES[0]?.value ?? ""]}
              onChange={() => undefined}
            />
          </Row>
        </Section>

        <Section name="CheckRow" note="52 px rows; the last is the 44 px compact one.">
          <Checks />
        </Section>

        <Section name="KindTile" note="Empty's five kinds.">
          <div class="gal__kinds">
            <KindTile kind="cards">Cards</KindTile>
            <KindTile kind="bulk">Tokens and dice</KindTile>
            <KindTile kind="tiles">Tiles</KindTile>
            <KindTile kind="minis">Miniatures</KindTile>
            <KindTile kind="custom" class="gal__wide">
              Something else
            </KindTile>
          </div>
        </Section>

        <Section
          name="IconTile"
          note="34, 36, 40 and 44 px; on a kind's colours or the neutral ground."
        >
          <Row label="Cards">
            <IconTile size={34} kind="cards" />
            <IconTile size={36} kind="cards" />
            <IconTile size={40} kind="cards" />
            <IconTile size={44} kind="cards" />
          </Row>
          <Row label="The other kinds">
            <IconTile size={36} kind="bulk" />
            <IconTile size={36} kind="tiles" />
            <IconTile size={36} kind="minis" />
            <IconTile size={36} kind="custom" />
          </Row>
          <Row label="Neutral">
            <IconTile size={40}>
              <Icon name="box" size={20} />
            </IconTile>
            <IconTile size={40}>
              <Icon name="file" size={20} />
            </IconTile>
          </Row>
        </Section>

        <Section
          name="ListRow"
          note="Main's list: selected, lit (Coins and cubes: its trays are being pointed at), with a rule chip, and a long name on one line."
        >
          <Rows />
        </Section>

        <Section name="RuleChip" note="Ink pill, 32 px drawn and a 44 px target.">
          <Row>
            <RuleChip aria-label="Unpin Market deck and the trays on it">Pinned</RuleChip>
            <RuleChip aria-label="Unpin Heroes and the trays on it">Pinned, turned</RuleChip>
            <RuleChip aria-label="Unlock size of Hex tiles">Size locked</RuleChip>
          </Row>
        </Section>

        <Section name="Card" note="Main's box card.">
          <Card onClick={() => undefined}>
            <IconTile size={40}>
              <Icon name="box" size={20} />
            </IconTile>
            <span class="gal__card-text">
              <span class="gal__card-label">The box</span>
              <span class="gal__card-value">285 × 285 × 70 mm</span>
            </span>
            <span class="gal__card-action">Change</span>
          </Card>
        </Section>

        <Section name="StatusHeading" note="One h1 per page; each tone's icon.">
          <StatusHeading
            level={3}
            tone="fit"
            title="Everything fits"
            line="10 trays in 2 layers, 66 of 70 mm high"
            extra={
              <>
                <Pick label="Layer" options={LAYERS} start="bottom" tone="track" />
                <Button icon={<Icon name="search" size={16} />}>Try another arrangement</Button>
              </>
            }
          />
          <StatusHeading
            level={3}
            tone="info"
            title="Searching for a better plan…"
            line="This plan stays unless a better one turns up."
            extra={<Button>Stop</Button>}
          />
          <StatusHeading
            level={3}
            tone="warn"
            title="The Heroes tray doesn't fit yet"
            line="The figures are 46 mm tall, but there's only 40 mm under the top layer."
          />
          <StatusHeading level={3} tone="error" title="Fix the errors marked in the inputs" />
          <StatusHeading level={3} tone="neutral" title="No plan yet" />
        </Section>

        <Section name="Notice" note="Main's banner, info and warn.">
          <Notice
            tone="info"
            title="This plan is from before your last changes."
            primary={{ label: "Make a new plan", onClick: () => undefined }}
          >
            Download is off until it is updated.
          </Notice>
          <Notice
            tone="warn"
            title="Made with an older version of the app."
            primary={{ label: "Make a new plan", onClick: () => undefined }}
            secondary={{ label: "Use the old plan", onClick: () => undefined }}
          >
            Trays printed from it will not stack with trays you print now.
          </Notice>
        </Section>

        <Section name="Toast" note="Edit's note. It goes by itself after four seconds.">
          <ToastNote>Finger cuts added.</ToastNote>
          <NoteDemo />
        </Section>

        <Section name="Disclosure" note="Edit's More options: closed, then open.">
          <DisclosureDemo />
        </Section>

        <Section
          name="DisclosureRow"
          note="Settings' rows: changed, with the changed dot, plain and open."
        >
          <div class="gal__list">
            <DisclosureRow title="Room around trays" changed={2} />
            <DisclosureRow title="Cards" meta="4 values" />
            <DisclosureRow plain dot title="Copies" meta="×4" />
            <DisclosureRow title="Rim between layers" meta="5 values" open controls="gal-open" />
          </div>
        </Section>

        <Section name="ProgressBar" note="Exporting's bar at 10, 30 and 100 percent.">
          <ProgressBar value={10} label="Building the file, 10 percent" />
          <ProgressBar value={30} label="Building the file, 30 percent" />
          <ProgressBar value={100} label="Building the file, done" />
        </Section>

        <Section name="SearchField" note="Settings' search box.">
          <SearchFieldDemo />
        </Section>

        <Section name="StepBadge" note="Empty's steps: the active one, then the next.">
          <Row>
            <StepBadge n={1} active />
            <StepBadge n={2} />
          </Row>
        </Section>

        <Section
          name="MenuPanel"
          note="Main's menu: a disclosure panel of plain buttons."
          region="menu"
        >
          <MenuPanel label="Project">
            <MenuItem>New insert</MenuItem>
            <MenuItem meta="3 in this browser">Your inserts</MenuItem>
            <MenuItem>Open file…</MenuItem>
            <MenuItem>Save file</MenuItem>
            <MenuSeparator />
            <MenuItem>Settings</MenuItem>
          </MenuPanel>
        </Section>

        <Section
          name="Dialog"
          note="Export's dialog: radius 22, padding 32, over the dimmed page."
          region="dialog"
        >
          <div class="k-dialog gal__surface" role="group" aria-labelledby="gal-dialog-title">
            <div class="gal__dialog-head">
              <div>
                <h2 id="gal-dialog-title" class="gal__dialog-title">
                  Ready to print
                </h2>
                <span class="gal__muted">8 trays and 2 spacers for Harbour Kings</span>
              </div>
              <CloseButton />
            </div>
            <Button variant="primary" size="cta" icon={<Icon name="download" />}>
              Download the 3MF file
            </Button>
          </div>
          <DialogDemo />
        </Section>

        <Section
          name="Drawer"
          note="Settings' drawer: right, full height, the drawer shadow."
          region="drawer"
        >
          <div
            class="k-drawer gal__surface gal__surface--drawer"
            role="group"
            aria-labelledby="gal-drawer-title"
          >
            <div class="gal__drawer-head">
              <h2 id="gal-drawer-title" class="gal__dialog-title">
                Settings
              </h2>
              <Button variant="quiet">Reset all</Button>
              <CloseButton />
            </div>
            <div class="gal__drawer-body">
              <Pick
                label="Settings for"
                options={[
                  { value: "insert", label: "This insert" },
                  { value: "printer", label: "My printer" },
                ]}
                start="insert"
                stretch
              />
            </div>
            <div class="gal__drawer-foot">
              <Button variant="primary" size="dialog">
                Done
              </Button>
            </div>
          </div>
        </Section>

        <Section
          name="Sheet"
          note="MobileWorkspace's sheet, peeking: handle, title, count and Add. It is the disclosure sheet; a tray's modal sheet (MobileTray) is the bottom Dialog."
          region="sheet"
        >
          <SheetDemo />
        </Section>
      </div>
    </main>
  );
}

function SearchFieldDemo() {
  const [text, setText] = useState("");
  return (
    <SearchField
      label="Find a setting"
      placeholder="Find a setting, like floor or lip"
      value={text}
      onInput={setText}
    />
  );
}
