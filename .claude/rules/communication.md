# Communication

## Language

Everything in git is English: code, docs, scripts, commit messages, PR text. Chat with the
user in Russian. Translate a Russian comment when you touch a file that may hold one.

## Write like a person

Everything here is read by someone: a chat reply, a commit, a PR description, a Notion ticket.
Before any of them leaves you, run the `unslop` skill over it (`unslop-ru` for Russian). It is a
user-level skill rather than part of this repository, so when it is not available apply the
list below by hand. The mechanical part of it, the dash, the quotes and the word list, is
also what `pnpm lint:docs` refuses in tracked prose.

- No em dash. End the sentence or use a comma.
- A colon introduces a list or an example, never a mid-sentence connector.
- Plain words: `use`, `help`, `many`. Cut `utilize`, `facilitate`, `numerous`, `additionally`,
  `crucial`, `delve`, `showcase`, `testament`, `underscore`, `landscape` and `tapestry` as
  metaphors, and trailing `-ing` clauses.
- Active voice, one idea per sentence, the natural number rather than groups of three, no
  "not only A but B", no synonym cycling.
- Say what a thing does, not how it feels. A bold lead-in must add something. Sentence case in
  headings, no decorative emoji, straight quotes.
- No chatbot filler and no apology opener. Have a position and write "I" when the sentence is
  about your own call.
- No competitor's name anywhere in the repository; the list is in
  [`docs-ownership.json`](../config/docs-ownership.json), the only file allowed to hold it.

## Git is the user's call

On your own, only `git add`. Commit, push, branching, rebasing and opening a PR wait for the
user to ask. Typing [`/prep-pr`](../commands/prep-pr.md) or [`/close-ticket`](../commands/close-ticket.md)
is that ask for what each command does and nothing past it; a merge still waits, and a force
push is denied outright. One exception: when a new feature starts on `main`, create the feature
branch first.

## Naming and messages describe behaviour

Branch names, commits and PR text say what changes for the app and why, not which files moved.

- Branch: `F<phase>.<feature>-<what-it-does>`, such as `F1.1-add-clerk-to-frontend`.
- Commit: Conventional Commits with the ticket as scope,
  `<type>(F<x.x>): <what changed, in behaviour terms>`. Types: `feat`, `fix`, `chore`, `docs`,
  `refactor`, `test`, `build`, `ci`, `perf`.
- PR title: the problem the PR solves, readable alone in the PR list.
- PR description: **What & why** is always there, one to three sentences. Add **Changes** when
  there are many and the order matters, **Testing** when it says something CI does not,
  **Notes / follow-ups** when a gap was left deliberately or the reviewer must do something by
  hand. A section that would hold "n/a" is deleted.

## Reporting

- Direct and concrete: bullets over paragraphs, `file:line` over "the auth code".
- Options come with a recommendation and its reason. Decisions that are the user's get asked;
  routine ones get made.
- Findings are graded **MUST FIX** (breaks behaviour, violates a rule, fails CI), **SHOULD FIX**
  (convention or maintainability) or **NICE TO HAVE** (ships). The first two block
  [`/prep-pr`](../commands/prep-pr.md) until fixed or overruled.
- Close by saying what was run, what it proved, and what is still open.
