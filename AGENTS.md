# Agent rules for Sparkbench

## UI: everything comes from the design system

There are no ad-hoc components. Every piece of UI is built from the design system in `src/ui/ds/`, which is catalogued in `docs/design/design-system.md`.

1. **Search first.** Before writing any UI, look in `src/ui/ds/index.tsx` and the catalog for a component that already does the job: `Button`, `IconButton`, `TextInput`, `TextArea`, `Select`, `Field`, `Banner`, `Chip`, `Card`, `PanelHead`, `Modal`, `Menu`, `Tabs` and the rest. Use it, with its variants and props.
2. **If nothing fits, design it into the system first.**
   - Add the component to `src/ui/ds/`, with its styles in `src/ui/ds/ds.css`, using tokens only.
   - Add a catalog entry to `docs/design/design-system.md`.
   - Only then use it on the screen.
   - Prefer extending an existing component with a variant over adding a near-duplicate.
3. **Don't style raw elements in screens.** No raw `<button>`, `<input>`, `<select>` or `<textarea>`, and no hand-rolled banners, chips, cards, menus, tabs or dialogs outside `src/ui/ds/`.
4. **Use tokens for color, radius and type.** Never hard-code a hex value in chrome. The wiring canvas, parts and boards are content, not chrome, and keep their real-world colors.

This is enforced. `npm run ds:check` and the unit test `tests/unit/design-system.test.ts` fail when a file gains ad-hoc UI. After migrating code to the design system, run `npx tsx scripts/ds-check.ts --write` to lower the recorded baseline. Never raise it.
