# @rondo/ui

Shared UI components: the **shadcn/ui** base, generated in the `base-rhea` style over a zinc
palette with a blue accent. The tokens live in `apps/web/src/app/globals.css`, because the app
owns the Tailwind entry point. `components.json` holds the rest of what the generator needs to
reproduce this look: the style, the base colour, the icon set and the two menu settings.

The package ships **source, not a build**. `@rondo/web` compiles it through Next's
`transpilePackages`, so the `build` script is a no-op on purpose. Components are imported
by path (`@rondo/ui/components/ui/button`), which keeps the import graph explicit and
avoids a barrel file that pulls every primitive into every bundle.

## What is here

```text
src/
  components/
    ui/                 # shadcn/ui primitives, generated: alert, button, card, checkbox,
                        # combobox, calendar, command, dialog, drawer, dropdown-menu, input,
                        # input-group, item, label, popover, radio-group, select, separator,
                        # skeleton, textarea, tooltip
    theme-provider.tsx  # next-themes provider (light/dark)
    theme-toggle.tsx    # the one-press light/dark switch in the app header
    theme-select.tsx    # the three-way choice on the settings screen, one icon per theme,
                        # labels passed in, so next-themes stays in this package and the
                        # strings stay in apps/web
  hooks/use-mobile.ts   # `useIsMobile`: the breakpoint a component branches on when the
                        # phone needs a different container, not just different classes
  lib/utils.ts          # `cn` — the clsx + tailwind-merge helper every primitive uses
```

Icons come from `@tabler/icons-react`; the primitives are built on `@base-ui/react`.

## Adding a primitive

Generate it, never hand-write it:

```bash
pnpm dlx shadcn@latest add <component>   # run inside packages/ui
```

There are two `components.json`, one here and one in `apps/web`, and the generator settings in
them have to match. The CLI searches upward from the working directory, so a run started inside
the app picks the app's file; a stale one there would emit components of a design system this
package no longer uses.

`components.json` points the generator at this package (`@rondo/ui/components`,
`@rondo/ui/lib`, `@rondo/ui/hooks`) and at the theme's CSS variables, which live in
`apps/web/src/app/globals.css`. The app owns the Tailwind entry point, so the tokens are
defined there and consumed here.

### What the generator owns

Every file under `components/ui` keeps the generator's markup, and a regeneration overwrites the
whole file. A colour that feels wrong is a theme question, and the theme lives in
`apps/web/src/app/globals.css`; a cursor is a rule in the same file, which is why the pointer on
menu and option roles is written there rather than in a primitive.

**Several files carry hand edits, and a regeneration drops them.** `popover.tsx` gained three parts
the generator leaves out: `Backdrop`, which lets a popover dim and blur the page behind it
instead of merging into it, `Close`, without which `modal` traps no focus at all, because
base-ui gates the trap on that part being present, and an opt-in `Arrow`, so a popover opened
from one small control can point back at it rather than floating loose. The arrow takes its
colour with `bg-inherit`, which is what lets a caller repaint the popup without repainting the
arrow separately. `calendar.tsx` carries several: the generator declares a ref for the focused
day and never attaches it, so `ref.current` stays null and arrow keys move the day picker's
own focus without moving the browser's. Attaching it is one word, and losing it again would
take the keyboard out of the calendar. Beside it live the cell size the app draws a month at
and the shape of a selection: a day is a circle, and so are both ends of a range, while the
band between them stays square and caps at the end of a row. The dependency is `modal`'s and not the
backdrop's, so every `modal` popover passes `closeLabel`, with or without a backdrop, and one
that skips it stops the mouse and not the keyboard. It also forwards `collisionAvoidance`, so a
popover whose content grows while it is open can be told to slide rather than jump to the other
side of its trigger. `command.tsx` and
`combobox.tsx` hold the shape of every picker this app draws: the height and radius of a row,
the height and radius of the search field, the padding around the list, the tint a row takes
under the pointer, the width the popup takes from its anchor, and the double chevron on the
trigger, which is the mark that says a value is chosen here rather than a section expanded. They live in the primitive because two screens need the same picker, and a
value copied into both is a value that will differ by the next change. `select.tsx` opens its
popup under the trigger rather than over the selected item, so the list lines up with the box it
came from. And `select.tsx`, `dropdown-menu.tsx` and `combobox.tsx` keep their open and close
animations, which the generator suppresses outright; here they are suppressed only for a reader
who asked for reduced motion. So after regenerating any of these, put them back and look at both
the onboarding currency sheet and the move dialog, which is where the difference shows.

`button.tsx` carries the shape a control takes rather than leaving it to the call site.
The radius is a variant of its own, `shape`, because radius and height do not travel together
here: a pill-shaped control exists at more than one height, and a square-cornered one does too.
`size="xl"` is the height a surface asks for when its controls are meant to be hit with a
thumb, and `icon-xl` is the same height square: the record form and the account panel's narrow
half use it, while most dialogs here keep the default height. It is what a surface chooses, not
what a dialog gets. Before this they were a class string copied into every screen that opened a
dialog, which is how two of them end up a pixel apart. A call site that writes a height or a
radius by hand is either reaching for a size that does not exist yet, which belongs here, or
drifting from the rest.

The one thing a new file gets afterwards is `eslint --fix` and Prettier. The generator writes
double quotes, no semicolons and its own import order, all of which the gate refuses. That
pass changes no markup, and a regeneration simply needs it again.

A primitive may arrive with company. Asking for `command` also writes `dialog`, `input-group`
and `textarea`, because it is built on them. Keep those; a later `add` would fetch them anyway.
One nobody imports is a different matter: generate it when a screen needs it rather than
leaving it lying about, since `add` takes a second.

## Tests

No tests of its own. The primitives are generated upstream code, and `@rondo/web`'s unit
tests and e2e exercise them (see [docs/testing.md](../../docs/testing.md)).
Anything hand-written that grows real behaviour gets its own tests here.
