# Design system

Sparkbench's chrome follows [Praci's design system](https://github.com/dennisonbertram/praci/blob/main/docs/design-system/README.md).
Praci is Apache-2.0 and derived from Rakazo; the palette values below come from its `packages/ui-tokens`.

- **Monochrome ink.** The page, panels and controls are warm grays. The primary action (Run, Design it, Send) is ink: near-black in light mode, near-white in dark mode.
- **Colour means status:** `--error`, `--warn`, `--ok`, `--working` (in progress) and `--select` (links, selection).
- **Type:** Geist and Geist Mono (OFL, via `@fontsource-variable`).
- **Radius:** `--radius-control` (10px) for controls, `--radius` (12px) for menus and cards, 16px for the composer.
- **The canvas is the exception.** The wiring view is the workbench itself: a green cutting mat on which signal yellow (`--signal`) marks live wires, selections and readings, and parts keep their real colours.

Tokens live at the top of `src/ui/ds/ds.css`, with light, system-dark and forced-dark (`data-theme`) blocks. Use them; don't hard-code colours in chrome.

- **Shadows:** `--shadow-menu` (menus), `--shadow-pop` (popovers and coachmarks), `--shadow-modal` (dialogs).
- **Inverse:** `--inverse`, `--inverse-ink`, `--inverse-line` style controls laid over a dark picture (the rendered circuit board). They are the same in light and dark mode, because the picture is.

Differences from Praci:
- `--line` is `#e4e4df` in light mode rather than Praci's `#f0f0ed`, because Sparkbench's denser panels need visible dividers.
- `--ink-2` is an extra mid-gray between foreground and muted text.

## Rules

There are no ad-hoc components (see `AGENTS.md`):

1. Search this catalog and `src/ui/ds/index.tsx` first.
2. If nothing fits, add the component to `src/ui/ds/`, with styles in `ds.css` and an entry here, then use it.
3. Screens never style raw `<button>`, `<input>`, `<select>` or `<textarea>`, and never hand-roll banners, chips, cards, menus, tabs or dialogs.

`npm run ds:check` and `tests/unit/design-system.test.ts` enforce this with a per-file ratchet, recorded in `scripts/ds-baseline.json`. The check counts, outside `src/ui/ds`: raw `<button>`, `<input>`, `<select>`, `<textarea>` and `<details>`; the whole class names `banner`, `chip`, `board-chip`, `modal`, `menu`, `card` and `problem`; `<a className="button">`; and hand-written `role="tab"`/`tablist`, `menu`/`menuitem`, `radio`/`radiogroup`, `dialog` (or `aria-modal`) and `role="alert"` on anything but a `Banner`. The baseline is now empty: every screen is on the design system. Canvas, part and board drawings are content and are not counted.

## Catalog

All components are imported from `src/ui/ds`.

### Actions

| Component | Use it for | Props |
| --- | --- | --- |
| `Button` | Every clickable action | `variant`: `default` (outlined), `primary` (ink: the one main action in view), `ghost` (toolbars, quiet actions), `link` (inline text), `danger` (destructive). `size`: `sm`, `md`, `lg`. `on`: toggled state. Defaults to `type="button"`, so pass `type="submit"` in forms. |
| `IconButton` | A square button showing only an icon or symbol | `label` (required; the accessible name and tooltip), plus every `Button` prop. Ghost by default. |
| `ButtonLink` | A link that looks like a button: file downloads, "open in a new tab", a jump to a section | `variant` and `size` as on `Button`, plus native `<a>` props (`href`, `download`, `target`). Never style `<a className="button">` by hand. |

### Form controls

| Component | Use it for | Props |
| --- | --- | --- |
| `TextInput` | One line of text, search, URL, number or password | Native input props. `type` defaults to `text`. |
| `TextArea` | Multi-line text | Native textarea props. |
| `Select` | Picking one item from a short list | Native select props, with `<option>` children. |
| `Field` | A label above a control, with an optional hint below | `label`, `hint`, `children`. `layout`: `stack` (default, label above) or `row` (label on the left, control on the right, hint under the control: inspector-style property rows). |
| `Checkbox` | An on/off choice with a label | `label`, plus native checkbox props. |
| `Radio` | One option in a group | `label`, `name`, plus native radio props. |
| `Slider` | A number in a range | Native range props. |
| `ColorInput` | Picking a colour (wire colours) | Native color props. A 50 × 28 swatch. |
| `Segmented` | One of a few options side by side as a pill group (case style, a mode) | `options` (`{id, label, title?}`), `value`, `onChange(id)`, `label` (required accessible name), `className`. A `radiogroup`: arrow keys, Home and End move the choice; only the chosen option is in the Tab order. Use it instead of hand-built `role="radio"` buttons; to switch between views, use `Tabs`. |
| `FilePicker` | Opening the system file picker | `children` is the visible label. Also `accept`, `multiple`, `onChange`, `variant`. `asMenuItem` renders it as a menu row. |

### Status and labels

| Component | Use it for | Props |
| --- | --- | --- |
| `Banner` | A one-line message across a panel: what happened, plus at most one action | `tone`: `neutral`, `info`, `ok`, `warn`, `error`. `error` sets `role="alert"`. `variant`: `inset` (default, a rounded box inside a panel), `strip` (full width under the top bar), `inline` (a problem row in a list or form: a coloured bar on the left, no outer margin; replaces hand-written `.problem` rows; give the rows `role="listitem"` inside a `role="list"` when they form a list, so errors are not each announced as alerts). Any message with `role="alert"` is a `Banner`. |
| `Chip` | A small rounded label (board names, tags) | Native span props. |

### Surfaces

| Component | Use it for | Props |
| --- | --- | --- |
| `Card` | A bordered surface, such as a gallery or example tile | Pass `onClick` to make the whole card a button. |
| `PanelHead` | A panel or dialog header: title on the left, actions on the right | `title`, plus action `children`. |
| `Disclosure` | A card that folds open: power and batteries, revisions, "Parts for the board", the multimeter guide, Wi-Fi updates; `plain` for "Why it's wired this way" in chat and the KiCad check rows. Use it instead of a raw `<details>` (a button that opens a list of actions is a `DisclosureMenu`). | `summary` (always shown, after a chevron), `children` (shown when open), `defaultOpen` (first state only), `onToggle(open)`, `variant`: `card` (default, bordered surface) or `plain` (no border: a smaller disclosure inside another surface). Native details props such as `data-testid` pass through. |

### Overlays and navigation

| Component | Use it for | Props |
| --- | --- | --- |
| `Modal` | A dialog over a scrim. Focus stays inside; Escape and ✕ close it. | `title`, `onClose`, `className` (for width), `closeLabel`. |
| `Menu`, `MenuAnchor`, `MenuItem`, `MenuSection`, `MenuNote` | Drop-down menus. Wrap the trigger and `Menu` in a `MenuAnchor`. | Native props. `Menu` `align`: `end` (default, right edges line up) or `start`. `MenuSection` is a divider with a heading. |
| `DisclosureMenu` | A button that opens a menu of actions below it ("Files for engineering tools ▾") | `label`, `children` (`MenuItem`s), `align` (`start` default), `variant`, `size`, `title`, `className`, `menuClassName`. Picking an item, Escape or a click outside closes it; ArrowDown on the button opens it on the first item; arrow keys, Home and End move between items. |
| `Popover` | A non-modal floating panel next to an element, such as the parts library under “+ Add part”. Never hand-build `role="dialog"`. | `label` (or `aria-labelledby`), `onClose` (Escape; focus returns to the opener), `anchorRect` (a `getBoundingClientRect()`; without it the panel sits centred near the top), `placement`: `auto` (right, then left, above, below), `right`, `left`, `top`, `bottom`; always kept on screen. `trapFocus` keeps Tab inside and marks it `aria-modal`. `width` (default 340), `focusKey` (refocus `[data-autofocus]` when it changes). `placePopover()` is the placement maths on its own. |
| `Coachmark` | A Popover that teaches one thing: the guided tour, first-run hints | `title`, `step` ("Step 2 of 6"), `children` (the text), `actions` (buttons; mark the main one `data-autofocus`), plus every `Popover` prop. |
| `Tabs` | Switching between views of the same thing | `items` (`{id, label, badge?, testId?, title?}`: `badge` is shown after the label, e.g. counts), `value`, `onChange`, `label` (accessible name of the tablist). `variant`: `underline` (default, the main view tabs), `segmented` (a compact pill group for a picture or mode; `tone="dark"` on a dark picture), `file` (monospace file names, as on the Code tab). `children` are trailing content at the end of the bar (actions, a timer), outside the tablist itself. Only the selected tab is in the Tab order; arrow keys, Home and End move between tabs and select them. |

### AI and chat

The copilot chat, the Code Assistant and anything else where the agent talks, works or asks. Source: `src/ui/ds/ai.tsx`, styles in the "AI and chat" section of `ds.css`. Adapted from Praci's chat components (Apache-2.0, derived from Rakazo; the motion primitives come from beautifului.dev, MIT). All motion stops under `prefers-reduced-motion`.

| Component | Use it for | Props |
| --- | --- | --- |
| `ChatThread` | The scrolling transcript (`role="log"`, polite live region) | Native div props; forwards a ref for scrolling. |
| `ChatMessage` | One message. User text is a `--chat-user` bubble on the right, shown literally; assistant text is markdown on the left. | `from`: `user` or `assistant`. `text`, `pending` (muted, not parsed), `meta` (time, model, quick actions: shown on hover or focus, always on touch), `metaPinned`. `children` hold cards, tool activity, images and action buttons under the bubble; the extras box is drawn only when at least one child is real (`false`/`null` count as none). The bubble carries `data-testid="msg-text"`; `bubbleProps` adds or overrides attributes on it. Native div props such as `data-msg` and `className` pass through. Its own classes are prefixed (`ds-msg`, `ds-from-user` / `ds-from-assistant`, `is-pending`), so a screen's `msg ai pending` hooks do not collide. |
| `Markdown` | A model's markdown outside a message | `text`. Uses `marked`; raw HTML is escaped and `javascript:` links are dropped. |
| `Composer` | The chat input: a box that grows with its text, an attach slot and a round Send button, or Stop while busy. Enter sends, Shift+Enter is a new line, and Enter during IME composition never sends. | `value`, `onChange(text)`, `onSend()`, `label` (required accessible name), `placeholder`, `canSend` (overrides "non-blank text", e.g. images only), `busy`, `onStop`, `disabled`, `attach` (left slot), `top` (attachment previews), `aside` (a badge before Send), `footer` (below the box: cost hints, notes), `error` + `onDismissError`, `sendLabel`, `maxHeight`. Stop carries `data-testid="composer-stop"`; `stopProps` adds or overrides its attributes (e.g. the Copilot's `copilot-stop`). When `disabled`, the box fades but Stop does not while `busy && onStop`. Forwards a ref to the text box, which carries `data-composer-input`. |
| `ComposerError` | A send or run error above the composer | `message`, `onDismiss`, `onRetry`, `retryLabel`; extra action buttons as `children`. `role="alert"`. |
| `ToolCall` | One thing the agent did or is doing, as a phrase ("Placing parts", "Wiring", "Running checks") | `label`, `state`: `running` (shimmers), `done`, `failed`, `waiting`, `queued`, `skipped`. `count` (×3), `summary` (replaces the label once settled: "Ran 12 checks · 1 warning"), `lines` (`{text, failed?}`: makes the row a disclosure), `title` (tooltip). |
| `ToolCallList` | Several tool calls; while live, only the latest few | `steps` (ToolCall props), `limit` (use `LIVE_TOOL_STEP_WINDOW` while live). |
| `ToolCallGroup` | The folding tool-activity line: "Working… · 3 tools" open while live, "Done · 3 tools · 42s" folded after | `live`, `count`, `durationMs`, `label` (override), `children` (usually a `ToolCallList`). |
| `LoadingState` | The agent is working: pixel loader, shimmering label, live timer, latest step | `label`, `startedAt`, `detail`, `slowAfterMs` (default 2 min) and `slowHint`, then `onStop` / `onRetry` links. `role="status"`. |
| `Shimmer` | A shimmering label for "happening now" text inside other components | `children`. |
| `SuccessPop` | The beat after an approved change lands | `label`. |
| `ApprovalCard` | The agent asks before acting (apply a code change, rewire, flash a board): what it will do, a preview, Approve / Deny, optional "Always allow". Answered cards fold to their header. | `title`, `summary`, `description`, `children` (details or diff preview; tall content clips with Show more), `icon`, `status`: `pending`, `approved`, `always`, `denied`, `expired`. `canAnswer`, `approveLabel`, `denyLabel`, `onApprove`, `onDeny`, `onAlwaysAllow`, `alwaysLabel`, `alwaysHint`, `resultText`, `previewHeight`. Native div props (`data-testid`, default `approval-card`; `id`; `className`) pass through. A card waiting for an answer has `ds-approval-live`. Handlers may return a promise; the card shows "Sending…" and any thrown error. |
| `AskCard` | The agent asks the person a question | `question` (markdown), `detail`, `options` (`{id, label, hint?}`, numbered), `recommendedId` ("(suggested)"), `onAnswer(idOrText)`, `allowText`, `textPlaceholder`, `answer` (closes the card), `canAnswer`. Pick mode for several questions sent with one button: `selected` + `onSelect` turn the options into a radio group. Native div props (`data-testid`, default `ask-card`) pass through. The question's markdown has tight margins. |
| `Icon` | Small line icons inside these components and buttons | `name`: `check`, `x`, `clock`, `circle`, `dash`, `chevron-right`, `chevron-down`, `arrow-up`, `stop`, `plus`, `key`, `more`, `spark`. `size`. Decorative (`aria-hidden`): label the control around it. |

`ApprovalCard` and `AskCard` keep their buttons off for a second when they appear right after another card was answered, so a double click cannot approve the next request.
