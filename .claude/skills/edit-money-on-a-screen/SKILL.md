---
name: edit-money-on-a-screen
description: Build a field in apps/web that changes money: what it sends, which key it sends it under, what it does with each refusal, and the tests that are not optional. Use when a screen lets someone type an amount that becomes a write. The endpoint behind it is a different skill.
---

# Edit money on a screen

A field that changes money is not a form field that happens to hold digits. It has to answer
four questions the same way every time, and getting any of them wrong is a wrong number in
someone's budget rather than a bad user experience.

[`budget-month.tsx`](../../../apps/web/src/components/budget-month.tsx) is the worked example,
[`move-fields.tsx`](../../../apps/web/src/components/move-fields.tsx) with
[`move-target.ts`](../../../apps/web/src/lib/move-target.ts) is the surface itself,
[`money-field.tsx`](../../../apps/web/src/components/money-field.tsx) is the field an amount is
typed into, with the fault copy and the preview every form shares, and
[`save-failure.ts`](../../../apps/web/src/lib/save-failure.ts) is the classifier. Read them
beside this file.

## The surface names both sides and sends the amount itself

The API moves money between envelopes; it does not set what one holds. The typed amount **is**
the amount that moves, and it is never signed. The surface may seed that amount from what the
screen shows, which is a convenience rather than a base: the write carries the number in the
field, so the screen has to be right about what it seeded from.

Three things the amount still has to get right:

- **it is parsed to `bigint` minor units at the edge**, through
  [`lib/money.ts`](../../../apps/web/src/lib/money.ts). Through `Number`, `0,02` and `0,03` are
  the same write.
- **it takes arithmetic.** Someone topping an envelope up knows what they are adding, so
  `434+35` is one amount. Sum the terms in minor units; evaluating the string as a number puts
  the float back in by the side door.
- **an expression nobody finished typing is a third answer**, neither an amount nor a fault.
  `434+` reads as 434, and writing that is a number nobody asked for, while refusing it outright
  paints the field red on the keystroke after every `+`. So the reader reports the amount **and**
  that it is unfinished, and the write is what refuses it. Zero and a typed minus are refused
  the same way: the endpoint takes neither.

**The screen it was opened from is a side of the move, and it must be the right screen.** The
month comes from what the reader is looking at rather than from a clock, and the write is
refused while the shown month and the address disagree, while a re-read is in flight, and while
the month on screen failed to read. Test the write, not only the opening.

**The direction belongs to the layout, not to the amount.** Draw both envelopes, one per row,
name them, show what each holds, and put the arrow between them. It points at the row the
money lands in, and pressing it turns the operation around. The sign then belongs to the rows,
a minus beside the one losing money and a plus beside the one gaining it, and it moves with the
arrow rather than with anything the reader types.

Two things follow. **The envelope the surface was opened from stays put**, in the first row,
and is not a choice; only the other row is chosen, so the reader never has to work out which of
two pickers means what. And **the name of the action follows the direction**: money leaving the
pool into a category is assigning, whatever the endpoint calls it, so the button says so rather
than making the reader learn that assigning is a move.

The other side is chosen from what the month on screen answered with, never from a list
assembled anywhere else. That answer leaves out an envelope hidden before the end of the month
being looked at, and keeps one hidden after it, which is correct for the month and means an
older month can offer a side the endpoint will refuse. Expect that refusal rather than
defending against it: the flag the month carries says whether the row was hidden by the month being looked at, not whether it is hidden now, so an older month answers `false` for a category hidden today and the refusal is still the only truth.

## One key per intent, and the intent is the opening

Mint the key when the field opens, not per request. Send the same key for every attempt at that
one intent, and mint a new one when the intent changes.

What counts as a new intent is exactly this:

- a **success**: the next edit is a different operation;
- a **refusal** the server has already recorded (409, or any 400): the write either landed or
  was rejected outright, so the next attempt is new;
- a **lost request** is **not** a new intent. The same key is what makes a retry safe when the
  first request did arrive and only the answer was lost.

Two different fields never share a key. Freeze the field for as long as the key stands, so the
body cannot change under a key the server has already claimed. That is longer than the request
is in flight: a lost request keeps its key, so the field stays frozen until that one is retried
or thrown away, and both surfaces of one field freeze together or the phone becomes the hole.

## A form that names an amount without moving one

Setting a category's goal writes money into a request and moves none. Everything above still
holds, and the two things that change are worth stating so the next such form does not
re-derive them.

- **The amount is parsed at the edge the same way**, through
  [`lib/money.ts`](../../../apps/web/src/lib/money.ts), and sent as minor units. Seed the field
  with `typed`, never with `format`: a shown amount drops a fraction that is all zeros, and a
  field opened on `500` instead of `500,00` loses the decimals the moment someone types.
- **The refusals are the server's own**, so read them from `reason` rather than from the status
  alone. A goal of nothing is refused by the pipe, so the form must not offer the save at zero;
  a month already past is refused by the domain. Both belong in the form, beside the field,
  not in the page banner: the reader is inside a dialog and the banner is behind it.

One key still covers the whole life of the form, because one form is one intent whatever it
writes.

## Every refusal has its own answer, read from the reason and never from the message

Branching on the text of an error puts a server sentence into a UI branch and breaks the moment
anyone rewords it. The endpoint publishes a reason for exactly this; classify on that.

What never varies, whatever the refusal: a closed field never shows an amount the server does
not hold, and the notice does not disappear on its own.

Two things that are easy to miss and both cost money:

- **throwing an unretried request away is itself a state change.** A lost answer may mean the
  write landed, so dismissing the notice, pressing Escape or opening another card has to re-read
  the month. Leave it out and the tile keeps showing a number the server has already moved past,
  which is what the next dialog opens prefilled from, so the reader presses the button on a move
  that already happened. Firing that re-read and forgetting it leaves the same hole open for as
  long as the request takes. Hold every write, and the opening of every surface, until the
  re-read lands;
- **the notice has to render where the reader is looking.** On a phone the field lives in a
  modal, and a banner mounted in the page body sits behind its overlay: inert, out of the
  accessibility tree, and often scrolled off a page the modal has locked. Put the notice inside
  whatever is on top.

**The surface stays open for every refusal but the one that stales the whole screen**, because
picking another envelope or retyping the amount is exactly the fix, and closing it throws that
work away. The one exception is a budget that changed underneath: nothing inside the dialog can
mend that, so it closes and the notice goes to the page.

**A reason that does not say enough gets the general text.** The refusal for a hidden envelope
names no side, so a surface holding two of them cannot say which was hidden, and copy that
names a category would name the wrong one. Say less rather than guess.

What varies is where the notice goes and whether the month is re-read. Write it as a table in
one module rather than as conditionals spread through the component, so a new refusal is one
row and not a hunt.

## The screen predicts nothing

No number is carried forward from a write. On success, and on any refusal that changed or may
have changed what the server holds, invalidate and let the answer arrive. Summing a response
for display is fine; predicting what the next response will say is not.

**A re-read can fail too.** When the connection is still down the query errors while it still
holds the month it read before, so an early return on "the read failed" blanks the whole
budget at the worst moment. Gate that branch on there being no data at all.
Expect the invalidation to be wide: a future month's assignment moves the pool and every later
month at once, so it is the whole endpoint rather than the month on screen.

**Invalidate with the generated query key, never with a literal you wrote by hand.** The
generated key is an object carrying an id, a base URL and the request, so a string that looks
like the operation matches nothing and the screen quietly shows stale money. Take the id from
the generated key and match on that:

```ts
const [named] = xxxControllerReadQueryKey({ query: { month } });
queryClient.invalidateQueries({ queryKey: [{ _id: named._id }] });
```

## The tests, in the same change

Unit, rendering the screen against a mocked client. **Mock the query key in the shape the
generator really produces.** A mock that keys on a plain string passes while the real screen
never invalidates, which is the one bug this whole file exists to stop, and it is invisible at
every other level.

Cover, at least:

- the request body carries the amount itself, the two sides the right way round for each
  direction, and the month the reader is looking at rather than the month it is today;
- the direction the screen shows is the direction it sends, and what the surface seeds itself
  with matches what one press would then write;
- one key per opening, a new key after a success, and the same key on a retry after a lost
  request;
- each refusal: where the surface goes, what the amount reads, and that the notice stays;
- the notice reaches the reader on a phone as well as on a desktop;
- the failing field is named even when the answer arrives after it was closed;
- throwing an unretried request away re-reads, nothing can be written until that re-read
  lands, and a re-read that fails leaves the month up;
- an unfinished expression is refused by the write and shown as an amount by the field;
- every amount rendered under a currency whose minor digit count is not two.

One e2e journey proves the screens are wired together. It is the wrong level for the branches
above and the right one for "the money moved and the next screen agrees".
