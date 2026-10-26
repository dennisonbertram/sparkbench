# Design system

Sparkbench's chrome follows [Praci's design system](https://github.com/dennisonbertram/praci/blob/main/docs/design-system/README.md).
Praci is Apache-2.0 and derived from Rakazo; the palette values below come from its `packages/ui-tokens`.

- **Monochrome ink.** The page, panels and controls are warm grays. The primary action (Run, Design it, Send) is ink: near-black in light mode, near-white in dark mode.
- **Colour means status:** `--error`, `--warn`, `--ok`, `--working` (in progress) and `--select` (links, selection).
- **Type:** Geist and Geist Mono (OFL, via `@fontsource-variable`).
- **Radius:** `--radius-control` (10px) for controls, `--radius` (12px) for menus and cards, 16px for the composer.
- **The canvas is the exception.** The wiring view is the workbench itself: a green cutting mat on which signal yellow (`--signal`) marks live wires, selections and readings, and parts keep their real colours.

Tokens live at the top of `src/ui/ds/ds.css`, with light, system-dark and forced-dark (`data-theme`) blocks. Use them; don't hard-code colours in chrome.

Differences from Praci:
- `--line` is `#e4e4df` in light mode rather than Praci's `#f0f0ed`, because Sparkbench's denser panels need visible dividers.
- `--ink-2` is an extra mid-gray between foreground and muted text.

## Rules

There are no ad-hoc components (see `AGENTS.md`):

1. Search this catalog and `src/ui/ds/index.tsx` first.
2. If nothing fits, add the component to `src/ui/ds/`, with styles in `ds.css` and an entry here, then use it.
3. Screens never style raw `<button>`, `<input>`, `<select>` or `<textarea>`, and never hand-roll banners, chips, cards, menus, tabs or dialogs.

`npm run ds:check` and `tests/unit/design-system.test.ts` enforce this with a per-file ratchet, recorded in `scripts/ds-baseline.json`.

## Catalog

All components are imported from `src/ui/ds`.

### Actions

| Component | Use it for | Props |
| --- | --- | --- |
| `Button` | Every clickable action | `variant`: `default` (outlined), `primary` (ink: the one main action in view), `ghost` (toolbars, quiet actions), `link` (inline text), `danger` (destructive). `size`: `sm`, `md`, `lg`. `on`: toggled state. Defaults to `type="button"`, so pass `type="submit"` in forms. |
| `IconButton` | A square button showing only an icon or symbol | `label` (required; the accessible name and tooltip), plus every `Button` prop. Ghost by default. |

### Form controls

| Component | Use it for | Props |
| --- | --- | --- |
| `TextInput` | One line of text, search, URL, number or password | Native input props. `type` defaults to `text`. |
| `TextArea` | Multi-line text | Native textarea props. |
| `Select` | Picking one item from a short list | Native select props, with `<option>` children. |
| `Field` | A label above a control, with an optional hint below | `label`, `hint`, `children`. |
| `Checkbox` | An on/off choice with a label | `label`, plus native checkbox props. |
| `Radio` | One option in a group | `label`, `name`, plus native radio props. |
| `Slider` | A number in a range | Native range props. |
| `ColorInput` | Picking a colour (wire colours) | Native color props. |
| `FilePicker` | Opening the system file picker | `children` is the visible label. Also `accept`, `multiple`, `onChange`, `variant`. `asMenuItem` renders it as a menu row. |

### Status and labels

| Component | Use it for | Props |
| --- | --- | --- |
| `Banner` | A one-line message across a panel: what happened, plus at most one action | `tone`: `neutral`, `info`, `ok`, `warn`, `error`. `error` sets `role="alert"`. |
| `Chip` | A small rounded label (board names, tags) | Native span props. |

### Surfaces

| Component | Use it for | Props |
| --- | --- | --- |
| `Card` | A bordered surface, such as a gallery or example tile | Pass `onClick` to make the whole card a button. |
| `PanelHead` | A panel or dialog header: title on the left, actions on the right | `title`, plus action `children`. |

### Overlays and navigation

| Component | Use it for | Props |
| --- | --- | --- |
| `Modal` | A dialog over a scrim. Focus stays inside; Escape and ✕ close it. | `title`, `onClose`, `className` (for width), `closeLabel`. |
| `Menu`, `MenuAnchor`, `MenuItem`, `MenuSection`, `MenuNote` | Drop-down menus. Wrap the trigger and `Menu` in a `MenuAnchor`. | Native props. `MenuSection` is a divider with a heading. |
| `Tabs` | Switching between views of the same thing | `items` (`{id, label}`), `value`, `onChange`. |
