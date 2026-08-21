# Communication

## Language

Everything that goes into git is written in **English**: code, comments, docs, scripts,
commit messages, PR text. The project is public, and anyone may read it. A few older files
still carry Russian comments; do not imitate them, and translate them when you touch them.
Chat with the user in their language (Russian).

## Write like a person, not like a model

Everything here is read by someone: a chat reply, a commit message, a document, the rare comment
a machine has to read. The tells below are what make writing obviously machine-made, and they
are banned in all of it, Russian chat included. The em dash is the sharpest case. It is ordinary
punctuation in written Russian, but no chat client puts it within reach of the keyboard, so text
carrying one reads as pasted from a model whatever the language.

- **No em dash.** End the sentence or use a comma. Parentheses instead just trade one tell for
  another.
- **A colon introduces a list or an example.** Not a mid-sentence connector.
- **Say what a thing does, not how it feels.** A sentence that would fit unchanged in another
  project's documentation says nothing about this one. Cut it.
- **Plain words.** `use`, not `utilize`; `help`, not `facilitate`; `many`, not `numerous`. Cut
  `additionally`, `crucial`, `delve`, `showcase`, `testament`, `underscore`, and `landscape` or
  `tapestry` as metaphors. Cut trailing `-ing` clauses: `highlighting`, `ensuring`, `reflecting`.
- **Active voice, and name the actor.** "the compiler validates queries", not "queries are
  validated".
- **One idea per sentence.** If the reader has to backtrack to parse it, split it.
- **Use the natural number.** No forced groups of three, no "not only A, therefore B" framing,
  and no cycling through synonyms for the same thing. Repeat the noun.
- **A bold lead-in must add something.** `**Performance:** performance improved` is the tell.
- Sentence case in headings. No decorative emoji. Straight quotes.
- **No chatbot filler.** No "Great question", no "I hope this helps", no apology opener. Answer.
- Have a position, vary sentence length, and write "I" when the sentence is about your own call.

`pnpm lint:docs` refuses the mechanical half of this across every tracked document. A backticked
literal and a block a dependency maintains are quoted rather than written, so the check steps
over both. The rest is yours, and it applies to chat, where nothing checks it.

## Git is the user's call

On your own initiative, only `git add`. Every other git action waits for the user to ask:
`commit`, `push`, branching, rebasing, opening a PR. Drafting the message is your job;
deciding that it runs is theirs. Typing [`/prep-pr`](../commands/prep-pr.md) **is** that
decision, and the command then commits, pushes and opens the PR in one go. Asking in words
is that decision too. So is [`/close-ticket`](../commands/close-ticket.md), which ends on a
fresh `main` so that the next ticket does not start on the last one's branch. It works from a
clean tree only, never builds a merge commit (`--ff-only`), and deletes the **local** branches
the ticket came in on as part of the close. That last one asks nothing **in words**. Closing
the ticket is what makes those branches history, so the command neither hands the decision
back nor leaves them standing pending an answer. The harness still confirms the delete,
exactly as it confirms `/prep-pr`'s commit and push. And it licenses that act and nothing past
it. A merge, or a branch this ticket did not produce, still waits for the user, and a force
push is denied outright rather than asked about. The branch on the **server** is not included,
and that asymmetry is deliberate. A local delete loses nothing the merge commit and the reflog
do not still hold, while deleting a remote branch can destroy a commit that reached it after
the merge and lives nowhere else. GitHub removes it on merge anyway; when one survives, the
command names it and offers.
What is forbidden is reaching for git because it seemed like the next step.

There is one exception, and it exists because it prevents work from landing in the wrong
place. When a new feature starts while the branch is `main`, create the feature branch first.
That rule and the return above are two halves of one thing. A flow that never comes back to
`main` never reaches the branching rule at all.

## Naming and messages describe behaviour

Branch names, commit messages and PR text say **what changes for the app and why**, not
which files were touched. A reader who never opens the diff should still understand what
the work does.

- **Branch:** `F<phase>.<feature>-<what-it-does>`, the Notion ticket plus a short
  kebab-case description.
  ✅ `F1.1-add-clerk-to-frontend`, `F0.10-fix-railway-cache-mounts`
  ❌ `feature/updates`, `F1.1`, `fix-layout-and-proxy`
- **Commit:** Conventional Commits with the ticket as the scope, written
  `<type>(F<x.x>): <what changed, in behaviour terms>`. Types: `feat`, `fix`, `chore`,
  `docs`, `refactor`, `test`, `build`, `ci`, `perf`.
  ✅ `feat(F1.1): protect all routes and add a sign-in page`
  ❌ `feat(F1.1): edit layout.tsx, proxy.ts and turbo.json`
- **PR title:** the problem the PR solves, readable on its own in the PR list.
  ✅ `F1.1: close the app to anonymous visitors and add Clerk sign-in`
  ❌ `F1.1: Clerk changes`, `Update middleware and env files`
- **PR description:** length tracks how much of the reasoning is invisible in the diff, not
  how many files changed. **What & why** is the only part that is always there: one to three
  sentences, the problem and what the app does differently now. Add **Changes** when
  there is more than a handful and the order matters (user-visible behaviour first, then
  config, CI and dependencies, with a reason for each non-obvious one). Add **Testing** when
  it says something CI does not already report: a manual check, a test that proves this
  specific fix, something you could not verify. Add **Notes / follow-ups** when a gap was
  left deliberately, or when the reviewer must do something by hand: secrets, env variables,
  dashboard settings.
  A section you would fill with "n/a" or with a restatement of the title is deleted, not
  filled. An empty heading trains the reader to skip headings. A one-line fix gets a
  two-sentence body; a change that trades something off gets as much room as the trade-off
  needs.

## Reporting

- Be direct and concrete: bullets over paragraphs, `file:line` over "the auth code".
- Present options with a recommendation and its reason, not a survey. Decisions that are
  genuinely the user's (see [model integrity](model-integrity.md)) get asked; routine ones
  get made.
- Grade findings as **MUST FIX** (breaks behaviour, violates a rule, fails CI) /
  **SHOULD FIX** (convention or maintainability) / **NICE TO HAVE** (deferrable). The first
  two block [`/prep-pr`](../commands/prep-pr.md) until they are fixed or explicitly
  overruled, and the third ships. So the grade answers "should the PR wait for this?", not
  "how much does it bother me?".
- Close by saying what was run, what it proved, and what is still open.
