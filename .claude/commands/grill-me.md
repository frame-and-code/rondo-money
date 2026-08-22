---
description: Interview the user about a fuzzy task until the scope is genuinely shared, then hand off to /plan.
argument-hint: '<fuzzy task description>'
---

# Grill me

For tasks where the _spec_ is the bottleneck, not the implementation. The deliverable is
shared understanding, not a plan and not code.

## Method

Interview relentlessly, one branch at a time, and resolve dependencies between decisions in
order. Concretely:

1. **Ask the highest-use question first**, the one whose answer reframes the others.
2. **One question at a time.** Use `AskUserQuestion` when the options are clean and
   mutually exclusive; ask inline otherwise. Never bundle five questions into a paragraph.
3. **Always propose an answer with your reasoning.** Ask "I'd do X because of Y in
   `<file:line>`, right?", never a cold question. Asking without a recommendation hands
   the user the thinking that was yours to do.
4. **If the codebase or the PRD can answer it, go and read them instead of asking.** Cite
   what you found. A question you could have answered yourself says you didn't look.
5. **Stop when the understanding is shared.** Continuing past that point is noise.

## Output

```markdown
## Shared understanding: <one-line task>

### Decided

- <decision>, because <reason, citing file:line, a rule or the PRD>

### Found in the codebase

- `<file:line>`: <constraint this imposes>

### Still open (the user's call)

- <question>: <your recommendation>

### Out of scope

- <discussed and deliberately excluded>

### Next

`/plan "<the task restated with the decisions baked in>"`
```

Then **stop**. Do not roll into `/plan`. Let the user start it with the refined task.

$ARGUMENTS
