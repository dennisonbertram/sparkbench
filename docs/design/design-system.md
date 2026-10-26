# Design system

Sparkbench's chrome follows [Praci's design system](https://github.com/dennisonbertram/praci/blob/main/docs/design-system/README.md).
Praci is Apache-2.0 and derived from Rakazo; the palette values below come from its `packages/ui-tokens`.

- **Monochrome ink.** The page, panels and controls are warm grays. The primary action (Run, Design it, Send) is ink: near-black in light mode, near-white in dark mode.
- **Colour means status:** `--error`, `--warn`, `--ok`, `--working` (in progress) and `--select` (links, selection).
- **Type:** Geist and Geist Mono (OFL, via `@fontsource-variable`).
- **Radius:** `--radius-control` (10px) for controls, `--radius` (12px) for menus and cards, 16px for the composer.
- **The canvas is the exception.** The wiring view is the workbench itself: a green cutting mat on which signal yellow (`--signal`) marks live wires, selections and readings, and parts keep their real colours.

Tokens live at the top of `src/ui/styles.css`, with light, system-dark and forced-dark (`data-theme`) blocks. Use them; don't hard-code colours in chrome.

Differences from Praci:
- `--line` is `#e4e4df` in light mode rather than Praci's `#f0f0ed`, because Sparkbench's denser panels need visible dividers.
- `--ink-2` is an extra mid-gray between foreground and muted text.
