// The decision half of the PreToolUse Bash guard. guard-bash.sh is the entry point; this
// file reads the payload, works out what the command actually is, and prints the reason for
// a refusal.
//
// Why this is not a pile of regexes over the command string, which is what it replaced: the
// shell decides what a command means, and a pattern over the raw text keeps having to guess
// at the same three things it cannot see — where an argument ends, which word is the command,
// and which text is data. Six rounds of review found six bypasses that way, each defeating a
// different syntactic tell: quotes around a flag, a wrapper carrying its own option, a
// grouping paren, a keyword prefix. Every one of them was the same bug.
//
// So the command is tokenised the way a shell tokenises it — quoting and escaping removed
// exactly once — and the rules then talk about *words*. `git commit "--no-verify"` and
// `git commit --no-verify` become the same list of words, and `git commit -m "use -n here"`
// keeps its message as one word, so it can never be read as a flag. That distinction is free
// here and was the source of half the patches before.
//
// Scope, stated honestly, because a guard whose limits are unwritten gets trusted past them.
// This refuses an agent's own **accidents** — the ways a rule gets broken by someone who was
// not trying to break it. It is not a sandbox, and these deliberate spellings reach the same
// acts and are known to:
//
//   - `$VAR` standing in for a literal, and `$IFS` games — resolving them means tracking
//     variables across a command list against an environment this process does not have;
//   - a git alias (`git -c alias.zz='commit --no-verify' zz`) and `GIT_CONFIG_KEY_*` /
//     `GIT_CONFIG_COUNT` in the environment, both of which move the real command out of the
//     command line;
//   - an encoded or obfuscated string, a script file (`bash script.sh` — its contents are not
//     in the payload), a renamed binary, and anything `ssh host "…"` runs on another machine;
//   - a heredoc body, which is read as commands rather than as data.
//
// Each of those takes a deliberate keystroke that nobody types by accident, and closing them
// would mean re-implementing the shell — which is how the version this replaced got to eight
// bypasses. The layer that does not depend on any of this is the CI `secrets` job: it scans
// the whole history on every PR and cannot be skipped, so a secret does not reach `main`
// because a local hook was bypassed. Judge a new finding by which class it is in.

import { execFileSync } from 'node:child_process';

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

/**
 * Split a command line into simple commands, each a list of words, with quoting and escaping
 * resolved once — as the shell resolves them.
 *
 * `;` `&` `|` and a newline end a simple command. So do the grouping and nesting characters
 * `( ) { }` and the `$(` of a command substitution: whatever is inside them is a command in
 * its own right, and treating it as one is what stops `(HUSKY=0 git commit …)` from reading
 * as an argument to nothing.
 */
function tokenise(input) {
  const commands = [];
  let words = [];
  let word = '';
  let hasWord = false;
  let quote = null; // null | "'" | '"'

  const endWord = () => {
    if (hasWord) {
      words.push(word);
      word = '';
      hasWord = false;
    }
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };
  const push = (c) => {
    word += c;
    hasWord = true;
  };

  for (let i = 0; i < input.length; i++) {
    const c = input[i];

    if (quote === "'") {
      if (c === "'") quote = null;
      else push(c);
      continue;
    }

    if (quote === '"') {
      // Inside double quotes a backslash only escapes these four; anywhere else it is literal.
      if (c === '\\' && '"\\$`'.includes(input[i + 1])) {
        push(input[++i]);
      } else if ((c === '$' && input[i + 1] === '(') || c === '`') {
        // Double quotes suppress word splitting, not execution: bash runs a substitution
        // inside them exactly as it does outside. Treating one as text was the single place
        // this parser was inert where the shell is not, and `echo "$(git push origin main)"`
        // walked straight through it.
        if (c === '$') i++;
        quote = null;
        endCommand();
      } else if (c === '"') {
        quote = null;
      } else {
        push(c);
      }
      continue;
    }

    if (c === '\\') {
      // A backslash before a newline is a line continuation: the command carries on, so this
      // is not a word boundary at all.
      if (input[i + 1] === '\n') i++;
      else if (i + 1 < input.length) push(input[++i]);
      continue;
    }

    // `$'…'` and `$"…"` are quoting forms too: bash drops the `$` and the word is what is
    // inside. Keeping it made `HEAD:$'main'` read as `HEAD:$main`, which is a destination
    // nothing matches — one spelling that defeated every word-level rule at once.
    if (c === '$' && (input[i + 1] === "'" || input[i + 1] === '"')) {
      quote = input[++i];
      hasWord = true;
      continue;
    }

    if (c === "'" || c === '"') {
      quote = c;
      hasWord = true; // `""` is an empty word, not the absence of one
      continue;
    }

    // Everything after an unquoted `#` that opens a word is a comment: bash never runs it, so
    // reading it as arguments refused ordinary commands for what their own comment said.
    if (c === '#' && !hasWord) {
      while (i < input.length && input[i] !== '\n') i++;
      endCommand();
      continue;
    }

    if (c === '$' && input[i + 1] === '(') {
      i++;
      endCommand();
      continue;
    }

    if (c === ';' || c === '&' || c === '|' || c === '\n' || c === '`') {
      endCommand();
      continue;
    }

    if (c === '(' || c === ')' || c === '{' || c === '}') {
      endCommand();
      continue;
    }

    if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
      continue;
    }

    push(c);
  }

  endCommand();
  return commands;
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

// Words that stand in front of the real command, each mapped to the options that take the
// *next word* as their value. Both halves are load-bearing: the residual `-E` of `sudo -E`
// defeated a start-anchored pattern, and without the value lists `env -u FOO` and `nice -n 10`
// leave the value standing where the command should be, so everything after it reads as that
// value's arguments.
const WRAPPERS = new Map([
  ['command', []],
  ['exec', ['-a']],
  ['env', ['-u', '--unset', '-C', '--chdir', '-S']],
  [
    'sudo',
    [
      '-u',
      '--user',
      '-g',
      '--group',
      '-p',
      '--prompt',
      '-h',
      '--host',
      '-R',
      '--chroot',
      '-D',
      '--chdir',
      '-C',
      '--close-from',
    ],
  ],
  ['time', ['-o', '--output', '-f', '--format']],
  ['nice', ['-n', '--adjustment']],
  ['nohup', []],
  [
    'xargs',
    [
      '-I',
      '-i',
      '-n',
      '-P',
      '-d',
      '-E',
      '-L',
      '-s',
      '-a',
      '--replace',
      '--max-args',
      '--max-procs',
      '--delimiter',
      '--arg-file',
    ],
  ],
  ['stdbuf', ['-i', '-o', '-e', '--input', '--output', '--error']],
  ['timeout', ['-s', '--signal', '-k', '--kill-after']],
]);

// Shell keywords a command can sit behind inside a compound statement. `while ! git push …`
// is a retry idiom, not an evasion.
const KEYWORDS = new Set([
  '!',
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'while',
  'until',
  'do',
  'done',
  'for',
  'in',
]);

/**
 * Peel everything that precedes the command itself, returning the command's own words plus
 * the environment assignments made in front of it.
 */
function strip(words) {
  const assignments = [];
  let lookup = false;
  let i = 0;

  for (;;) {
    const w = words[i];
    if (w === undefined) break;

    if (ASSIGNMENT.test(w)) {
      assignments.push(w);
      i++;
      continue;
    }

    if (KEYWORDS.has(w)) {
      i++;
      continue;
    }

    if (WRAPPERS.has(w)) {
      const takesValue = WRAPPERS.get(w);
      i++;
      // The wrapper's own options — and where an option takes a separate word, that word too.
      while (words[i] !== undefined && words[i].startsWith('-')) {
        const opt = words[i];
        // `command -v npm` looks a name up rather than running it — the one option in this
        // list that turns the word after it from a command into a string.
        if (w === 'command' && (opt === '-v' || opt === '-V')) lookup = true;
        i++;
        if (takesValue.includes(opt) && words[i] !== undefined) i++;
      }
      // The duration `timeout` takes, once its options are out of the way.
      if (w === 'timeout' && /^[0-9]+[smhd]?$/.test(words[i] ?? '')) i++;
      continue;
    }

    // `pnpm exec <cmd>` runs a local binary, so the command is what follows — two words rather
    // than one, which is why it is not in the set above.
    if (w === 'pnpm' && words[i + 1] === 'exec') {
      i += 2;
      continue;
    }

    break;
  }

  return { assignments, argv: words.slice(i), lookup };
}

/**
 * Drop redirections, so their targets are not read as arguments. `git push > log` names no
 * refspec, and counting `log` as one made the push look deliberate enough to skip the
 * current-branch check.
 */
function withoutRedirects(words) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^[0-9]*(&?>>?|<<?)/.test(w)) {
      // `> file` puts the target in the next word; `>file` carries it inline.
      if (/^[0-9]*(&?>>?|<<?)$/.test(w)) i++;
      continue;
    }
    out.push(w);
  }
  return out;
}

// A shell handed a command string with `-c` runs that string, which makes it the same shape
// as `eval`: an argument that is really a command. `ssh host "…"` is not in this set, because
// what it runs runs somewhere else.
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);

// Builtins that set an environment variable for everything after them in the same shell —
// which is the whole Bash call, so `export HUSKY=0 && git commit …` really does commit with
// the hook disabled even though the two are separate commands.
const EXPORTERS = new Set(['export', 'declare', 'typeset', 'readonly', 'set']);

function currentBranch() {
  try {
    return execFileSync('git', ['-C', PROJECT_DIR, 'symbolic-ref', '--quiet', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const PROTECTED = new Set(['main', 'master']);

// The subcommands with rules here. `send-pack` is push by another name — it writes refs to a
// remote and takes the same refspecs.
const GIT_SUBCOMMANDS = new Set(['commit', 'push', 'send-pack', 'config']);

// `git push` options that take the next word, so its value is never mistaken for a refspec —
// `git push -o ci.skip origin` names no refspec at all.
const PUSH_OPTS_WITH_VALUE = new Set([
  '-o',
  '--push-option',
  '--exec',
  '--receive-pack',
  '--repo',
  '--recurse-submodules',
]);

/**
 * Split a `git` invocation into what precedes the subcommand and what follows it.
 *
 * Found by **naming** the subcommand rather than by enumerating the global options that take a
 * value — which is the difference between a rule that holds and a list that has to be
 * complete. Enumerating left `--attr-source` and `--config-env` off, and their value then
 * stood where the subcommand is read: `git --attr-source HEAD push origin +feat:main` was read
 * as a `HEAD` subcommand with no rules at all, and really did publish to main. A subcommand
 * always precedes its own arguments, so the first of these words is the one.
 */
function gitParts(argv) {
  const at = argv.findIndex((w, n) => n > 0 && GIT_SUBCOMMANDS.has(w));
  if (at === -1) return { pre: argv.slice(1), sub: undefined, rest: [] };
  return { pre: argv.slice(1, at), sub: argv[at], rest: argv.slice(at + 1) };
}

// git accepts any unambiguous abbreviation of a long option, and `--no-veri` is the shortest
// one that is not also a prefix of `--no-verbose`. Abbreviating is an ordinary keystroke, so
// matching the full spelling alone left the flag reachable by typing less of it.
const isNoVerify = (w) => w.startsWith('--no-veri') && '--no-verify'.startsWith(w);

// In a short-flag cluster the first option that takes a value swallows the rest as that value,
// so `-uno` is `--untracked-files=no` and has nothing to do with hooks. Read the cluster up to
// that point and no further; testing it whole refused a legal commit for a flag it never
// passed.
const GIT_SHORT_WITH_VALUE = 'mucCFtS';
const bundlesNoVerify = (w) => {
  if (!/^-[a-zA-Z]+$/.test(w)) return false;
  for (const ch of w.slice(1)) {
    if (ch === 'n') return true;
    if (GIT_SHORT_WITH_VALUE.includes(ch)) return false;
  }
  return false;
};

/** The refusal, or null. */
function verdict(command, depth = 0) {
  for (const words of tokenise(command)) {
    const { assignments, argv, lookup } = strip(words);

    // The pre-commit hook is the secret scan (ADR-003: publishing exposes the whole history),
    // and HUSKY=0 turns it off wherever the assignment is written — **before** the empty-argv
    // bail below, because a statement that is only an assignment has no command of its own and
    // was skipped entirely. One Bash call is one shell, so `set -a; HUSKY=0; git commit` and
    // `HUSKY=0; export HUSKY; git commit` really do commit with the hook unrun.
    if (assignments.includes('HUSKY=0')) {
      return 'HUSKY=0 disables the git hooks, including the secret scan.';
    }

    if (!argv.length || lookup) continue;

    // The same assignment written as an argument of the builtin that exports it.
    if (EXPORTERS.has(argv[0]) && argv.slice(1).includes('HUSKY=0')) {
      return 'HUSKY=0 disables the git hooks, including the secret scan.';
    }

    // `eval` runs the string it is handed: re-read that string as a command of its own.
    if (argv[0] === 'eval') {
      const inner = depth < 8 ? verdict(argv.slice(1).join(' '), depth + 1) : null;
      if (inner) return inner;
      continue;
    }

    // `bash -c "…"` (and `-lc`, and the other shells) is the same shape.
    if (SHELLS.has(argv[0])) {
      const flag = argv.findIndex((w, n) => n > 0 && /^-[a-zA-Z]*c$/.test(w));
      if (flag !== -1 && argv[flag + 1] !== undefined) {
        const inner = depth < 8 ? verdict(argv[flag + 1], depth + 1) : null;
        if (inner) return inner;
        continue;
      }
    }

    // This project is pnpm-only: a stray npm/yarn install rewrites the lockfile.
    if (argv[0] === 'npm' || argv[0] === 'yarn') {
      return 'this project uses pnpm. Use pnpm instead of npm/yarn.';
    }

    if (argv[0] === 'rm') {
      const flags = argv.slice(1).filter((w) => w.startsWith('-'));
      const targets = argv.slice(1).filter((w) => !w.startsWith('-'));
      if (flags.includes('--no-preserve-root')) {
        return 'rm --no-preserve-root. Name the exact path to remove.';
      }
      const recursive =
        flags.some((f) => f === '--recursive' || /^-[a-zA-Z]*r/i.test(f)) &&
        flags.some((f) => f === '--force' || /^-[a-zA-Z]*f/i.test(f));
      // Judged by shape rather than by equality: `../node_modules` walks out of the project
      // exactly as `..` does, and `/*` expands to everything `/` holds.
      const reckless = (t) =>
        // A path inside the project is the ordinary case, however it is spelled — and the
        // environment asks for absolute paths, so the recommended spelling must not be the
        // refused one.
        !t.startsWith(`${PROJECT_DIR}/`) &&
        (t === '/' ||
          t === '.' ||
          t === '..' ||
          t === '*' ||
          t === '/*' ||
          t === './*' ||
          t.startsWith('~') || // `~`, `~/…` and `~user`, all of which are somebody's home
          t.startsWith('/Users') ||
          t.startsWith('../'));
      if (recursive && targets.some(reckless)) {
        return 'dangerous recursive delete. Name the exact path to remove.';
      }
      continue;
    }

    if (argv[0] !== 'git') continue;

    const { pre, sub, rest } = gitParts(argv);

    // `git -c core.hooksPath=…` points git at an empty hook directory for one command;
    // `git config core.hooksPath …` writes it into the repository and outlives the command.
    // Only a *write* of it, though: `git config --get core.hooksPath` is what someone reads
    // when the pre-commit hook is behaving oddly, and answering that with "you are bypassing
    // the secret scan" is both wrong and the fastest way to get the guard switched off. A
    // write names the key and a value; a read names the key alone or carries a read flag.
    const configWords = sub === 'config' ? rest.filter((w) => !w.startsWith('-')) : [];
    const configReads = rest.some((w) => /^--(get|get-all|get-regexp|list|name-only)$/.test(w));
    const keyAt = configWords.findIndex((w) => w.includes('core.hooksPath'));
    const overridesHooks =
      pre.some((g) => g.includes('core.hooksPath')) ||
      (sub === 'config' && !configReads && keyAt !== -1 && configWords.length > keyAt + 1);
    if (overridesHooks) {
      return 'overriding core.hooksPath disables the git hooks, including the secret scan.';
    }

    if (sub === 'commit') {
      if (rest.some(isNoVerify)) {
        return '--no-verify skips the gitleaks pre-commit scan. Remove the secret instead.';
      }
      if (rest.some(bundlesNoVerify)) {
        return 'git commit -n skips the gitleaks pre-commit scan. Remove the secret instead.';
      }
      continue;
    }

    if (sub !== 'push' && sub !== 'send-pack') continue;

    if (rest.some(isNoVerify)) {
      return '--no-verify skips the gitleaks pre-commit scan. Remove the secret instead.';
    }

    let refspecs = 0;
    let tagsOnly = false;
    let dryRun = false;
    const args = withoutRedirects(rest);
    for (let i = 0; i < args.length; i++) {
      const w = args[i];

      if (w === '--all' || w === '--mirror') {
        return '--all/--mirror pushes every branch, main included. Name the branch instead.';
      }
      // `--tags` publishes refs/tags and no branch, so it is not a push of what is checked out.
      if (w === '--tags') {
        tagsOnly = true;
        continue;
      }
      // On push, `-n` means --dry-run — but only when it is an option rather than the *value*
      // of one: `git push -o -n origin HEAD:main` really pushes, and reading the raw list for
      // `-n` let that whole push read as a preview.
      if (w === '--dry-run' || w === '-n' || w === '--help') {
        dryRun = true;
        continue;
      }
      if (PUSH_OPTS_WITH_VALUE.has(w)) {
        i++;
        continue;
      }
      if (w.startsWith('-')) continue;

      refspecs++;

      // In `src:dst` the destination is what gets written; a leading `+` forces the push, the
      // spelling `--force` in the deny list never sees.
      // `heads/main` is stripped as well as `refs/heads/main`: git resolves an unqualified
      // destination against the refs the remote already has, and `refs/heads/main` always does.
      let dest = w.includes(':') ? w.slice(w.lastIndexOf(':') + 1) : w;
      dest = dest
        .replace(/^\+/, '')
        .replace(/^refs\/heads\//, '')
        .replace(/^heads\//, '');

      if (dest.includes('*')) {
        return 'a wildcard refspec pushes every branch it matches, main included.';
      }
      // `HEAD` and `@` name whatever is checked out — `git push origin HEAD` is the same push
      // with the branch name left out, which is exactly when it is reached for.
      if (dest === 'HEAD' || dest === '@') dest = currentBranch();

      if (PROTECTED.has(dest)) {
        return 'main takes changes through a PR only. Push the feature branch instead.';
      }
    }

    // The first non-option word is the remote, so one or none means no refspec was named and
    // git publishes the current branch. That is the accidental way onto main, and the likelier
    // one: every spelled-out form above takes a deliberate keystroke.
    if (refspecs <= 1 && !tagsOnly && !dryRun && PROTECTED.has(currentBranch())) {
      return 'this pushes the current branch, and it is main. Changes reach main through a PR.';
    }
  }

  return null;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let command;
  try {
    command = JSON.parse(raw)?.tool_input?.command ?? '';
  } catch {
    command = '';
  }
  if (!command) process.exit(0);

  const reason = verdict(command);
  if (reason) {
    process.stderr.write(`BLOCKED: ${reason}\n`);
    process.exit(2);
  }
  process.exit(0);
});
