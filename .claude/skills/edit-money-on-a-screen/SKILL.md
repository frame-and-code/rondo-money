---
name: edit-money-on-a-screen
description: Build a field in apps/web that changes money: what it sends, which key it sends it under, what it does with each refusal, and the tests that are not optional. Use when a screen lets someone type an amount that becomes a write. The endpoint behind it is a different skill.
---

# Edit money on a screen

A field that changes money is not a form field that happens to hold digits. It has to answer
four questions the same way every time, and getting any of them wrong is a wrong number in
someone's budget rather than a bad user experience.

[`budget-month.tsx`](../../../apps/web/src/components/budget-month.tsx) is the worked example,
[`assign-field.tsx`](../../../apps/web/src/components/assign-field.tsx) is the field itself,
and [`save-failure.ts`](../../../apps/web/src/lib/save-failure.ts) is the classifier. Read them
beside this file.

## Send the difference, never the value

The API moves money between envelopes; it does not set what one holds. So the field sends
`typed - held`, and the direction is which way round the two sides go. A negative difference is
the same move with the sides swapped, never a negative amount, because the endpoint refuses one.

Two consequences that are not obvious:

- **the base is what the screen is showing, and the screen has to be right.** After a save the
  field stays closed and the tile stays in its saving state until the reread lands. Reopen it
  any sooner and the next difference is measured from a number the server has already moved
  past, which silently doubles the write. The same disagreement arrives from the other side
  when the screen holds one period while the address already names the next: the difference
  comes from what is shown and the request carries what is asked for, so the write lands
  somewhere the reader never looked. Refuse both the write and the opening of the field while
  the two disagree, and test the write, not only the opening;
- **the subtraction happens in minor units, as `bigint`.** `0,02` to `0,03` is one minor unit.
  Through `Number` it is zero, the endpoint refuses a zero amount, and the user is told nothing
  happened. Parse to `bigint` at the edge with
  [`lib/money.ts`](../../../apps/web/src/lib/money.ts) and subtract there.

**The field takes arithmetic.** Someone topping an envelope up knows the amount they are adding,
not the total, so `434+35` has to be read as one amount. Sum the terms in minor units as `bigint`;
evaluating the string as a number puts the float back in by the side door.

An expression the person has not finished typing is a third answer, neither an amount nor a
fault. `434+` reads as 434, and committing that writes a number nobody asked for, while
refusing it outright paints the field red on the keystroke after every `+`. So the reader
reports the amount **and** that it is unfinished, and the write is what refuses it.

## One key per intent, and the intent is the opening

Mint the key when the field opens, not per request. Send the same key for every attempt at that
one intent, and mint a new one when the intent changes.

What counts as a new intent is exactly this:

- a **success**: the next edit is a different operation;
- a **refusal** the server has already recorded (409, or any 400): the write either landed or
  was rejected outright, so the next attempt is new;
- a **lost request** is **not** a new intent. The same key is what makes a retry safe when the
  first request did arrive and only the answer was lost.

Two different fields never share a key. Freeze the field while a request is in flight, so the
body cannot change under a key the server has already claimed.

## Every refusal has its own answer, read from the reason and never from the message

Branching on the text of an error puts a server sentence into a UI branch and breaks the moment
anyone rewords it. The endpoint publishes a reason for exactly this; classify on that.

What never varies, whatever the refusal: a closed field never shows an amount the server does
not hold, and the notice does not disappear on its own.

Two things that are easy to miss and both cost money:

- **throwing an unretried request away is itself a state change.** A lost answer may mean the
  write landed, so dismissing the notice, pressing Escape or moving to another tile has to
  re-read the month. Leave it out and the next difference is measured from a number the server
  has already moved past. Firing that re-read and forgetting it leaves the same hole open for
  as long as the request takes: the tile still shows the old number, so an edit started in that
  window measures from it and writes the move a second time. Hold every write, and the opening
  of every field, until the re-read lands;
- **the notice has to render where the reader is looking.** On a phone the field lives in a
  modal, and a banner mounted in the page body sits behind its overlay: inert, out of the
  accessibility tree, and often scrolled off a page the modal has locked. Put the notice inside
  whatever is on top.

What varies is where the field goes and whether the month is re-read. Write it as a table in
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

- the request body carries the difference, the two sides the right way round, and the month the
  reader is looking at rather than the month it is today;
- an unchanged amount sends nothing;
- a second edit measures from what the first one wrote;
- one key per opening, a new key after a success, the same key on a retry after a lost request,
  and different keys for two fields;
- each refusal: where the field goes, what the amount reads, and that the notice stays;
- the notice reaches the reader on a phone as well as on a desktop;
- the failing field is named even when the answer arrives after it was closed;
- throwing an unretried request away re-reads, nothing can be written until that re-read
  lands, and a re-read that fails leaves the month up;
- an unfinished expression is refused by the write and shown as an amount by the field;
- every amount rendered under a currency whose minor digit count is not two.

One e2e journey proves the screens are wired together. It is the wrong level for the branches
above and the right one for "the money moved and the next screen agrees".
