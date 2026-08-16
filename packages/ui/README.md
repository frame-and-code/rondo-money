# @rondo/ui

Shared UI components: the **shadcn/ui** base and the Ocean Breeze theme (F0.6).

The package ships **source, not a build** — `@rondo/web` compiles it through Next's
`transpilePackages`, so the `build` script is a no-op on purpose. Components are imported
by path (`@rondo/ui/components/ui/button`), which keeps the import graph explicit and
avoids a barrel file that pulls every primitive into every bundle.

## What is here

```text
src/
  components/
    ui/                 # shadcn/ui primitives, generated — button, card, dropdown-menu,
                        # input, label, separator
    theme-provider.tsx  # next-themes provider (light/dark)
    theme-toggle.tsx    # theme switch used in the app header
  lib/utils.ts          # `cn` — the clsx + tailwind-merge helper every primitive uses
```

Icons come from `lucide-react`; the primitives are built on `radix-ui`.

## Adding a primitive

Generate it, never hand-write it:

```bash
pnpm dlx shadcn@latest add <component>   # run inside packages/ui
```

`components.json` points the generator at this package (`@rondo/ui/components`,
`@rondo/ui/lib`, `@rondo/ui/hooks`) and at the theme's CSS variables, which live in
`apps/web/src/app/globals.css` — the app owns the Tailwind entry point, so the tokens are
defined there and consumed here.

## Tests

No tests of its own: the primitives are generated upstream code, and they are exercised
through `@rondo/web`'s unit tests and e2e (see [docs/testing.md](../../docs/testing.md)).
Anything hand-written that grows real behaviour gets its own tests here.
