import { execFileSync } from 'node:child_process';
import path from 'node:path';

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function tokenise(input) {
  const commands = [];
  let words = [];
  let word = '';
  let hasWord = false;
  let quote = null;

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
      if (c === '\\' && '"\\$`'.includes(input[i + 1])) {
        push(input[++i]);
      } else if ((c === '$' && input[i + 1] === '(') || c === '`') {
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
      if (input[i + 1] === '\n') i++;
      else if (i + 1 < input.length) push(input[++i]);
      continue;
    }

    if (c === '$' && (input[i + 1] === "'" || input[i + 1] === '"')) {
      quote = input[++i];
      hasWord = true;
      continue;
    }

    if (c === "'" || c === '"') {
      quote = c;
      hasWord = true;
      continue;
    }

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

function strip(words) {
  const assignments = [];
  let lookup = false;
  let splitString = null;
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
      while (words[i] !== undefined && words[i].startsWith('-')) {
        const opt = words[i];
        if (w === 'command' && (opt === '-v' || opt === '-V')) lookup = true;
        if (w === 'env' && opt.startsWith('--split-string=')) {
          splitString = opt.slice('--split-string='.length);
        }
        if (w === 'env' && (opt === '-S' || opt === '--split-string')) {
          splitString = words[i + 1] ?? '';
        }
        i++;
        if (takesValue.includes(opt) && words[i] !== undefined) i++;
      }
      if (w === 'timeout' && /^[0-9]+[smhd]?$/.test(words[i] ?? '')) i++;
      continue;
    }

    if (w === 'pnpm' && words[i + 1] === 'exec') {
      i += 2;
      continue;
    }

    break;
  }

  return { assignments, argv: words.slice(i), lookup, splitString };
}

function withoutRedirects(words) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^[0-9]*(&?>>?|<<?)/.test(w)) {
      if (/^[0-9]*(&?>>?|<<?)$/.test(w)) i++;
      continue;
    }
    out.push(w);
  }
  return out;
}

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);

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

const GIT_SUBCOMMANDS = new Set(['commit', 'push', 'send-pack', 'config']);

const GIT_GLOBAL_WITH_VALUE = new Set([
  '-c',
  '-C',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--exec-path',
  '--attr-source',
  '--config-env',
  '--super-prefix',
]);

const GIT_ANY_SUBCOMMAND = new Set([
  ...GIT_SUBCOMMANDS,
  'add',
  'am',
  'apply',
  'archive',
  'bisect',
  'blame',
  'branch',
  'cat-file',
  'checkout',
  'cherry-pick',
  'clean',
  'clone',
  'describe',
  'diff',
  'fetch',
  'for-each-ref',
  'gc',
  'grep',
  'init',
  'log',
  'ls-files',
  'ls-remote',
  'merge',
  'mv',
  'notes',
  'pull',
  'rebase',
  'reflog',
  'remote',
  'reset',
  'restore',
  'rev-parse',
  'revert',
  'rm',
  'shortlog',
  'show',
  'stash',
  'status',
  'submodule',
  'subtree',
  'switch',
  'symbolic-ref',
  'tag',
  'update-ref',
  'worktree',
]);

const PUSH_OPTS_WITH_VALUE = new Set([
  '-o',
  '--push-option',
  '--exec',
  '--receive-pack',
  '--repo',
  '--recurse-submodules',
]);

function gitParts(argv) {
  let i = 1;
  while (i < argv.length && argv[i].startsWith('-')) {
    const opt = argv[i];
    i++;
    if (GIT_GLOBAL_WITH_VALUE.has(opt) && argv[i] !== undefined) i++;
  }

  if (i < argv.length && !GIT_ANY_SUBCOMMAND.has(argv[i])) {
    const at = argv.findIndex((w, n) => n > i && GIT_ANY_SUBCOMMAND.has(w));
    if (at !== -1) i = at;
  }

  if (i >= argv.length) return { pre: argv.slice(1), sub: undefined, rest: [] };
  return { pre: argv.slice(1, i), sub: argv[i], rest: argv.slice(i + 1) };
}

const isNoVerify = (w) => w.startsWith('--no-veri') && '--no-verify'.startsWith(w);

const GIT_SHORT_WITH_VALUE = 'mucCFtS';
const bundlesNoVerify = (w) => {
  if (!/^-[a-zA-Z]+$/.test(w)) return false;
  for (const ch of w.slice(1)) {
    if (ch === 'n') return true;
    if (GIT_SHORT_WITH_VALUE.includes(ch)) return false;
  }
  return false;
};

function verdict(command, depth = 0) {
  for (const rawWords of tokenise(command)) {
    const words = withoutRedirects(rawWords);
    const { assignments, argv, lookup, splitString } = strip(words);

    if (splitString !== null) {
      const inner = depth < 8 ? verdict(splitString, depth + 1) : null;
      if (inner) return inner;
      continue;
    }

    if (assignments.includes('HUSKY=0')) {
      return 'HUSKY=0 disables the git hooks, including the secret scan.';
    }

    if (!argv.length || lookup) continue;

    if (EXPORTERS.has(argv[0]) && argv.slice(1).includes('HUSKY=0')) {
      return 'HUSKY=0 disables the git hooks, including the secret scan.';
    }

    if (argv[0] === 'eval') {
      const inner = depth < 8 ? verdict(argv.slice(1).join(' '), depth + 1) : null;
      if (inner) return inner;
      continue;
    }

    if (SHELLS.has(argv[0])) {
      const flag = argv.findIndex((w, n) => n > 0 && /^-[a-zA-Z]*c$/.test(w));
      if (flag !== -1 && argv[flag + 1] !== undefined) {
        const inner = depth < 8 ? verdict(argv[flag + 1], depth + 1) : null;
        if (inner) return inner;
        continue;
      }
    }

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
      const reckless = (t) => {
        if (t.startsWith('~')) return true;
        if (t === '*' || t === './*' || t === '/*') return true;
        const target = path.resolve(PROJECT_DIR, t.replace(/\/\*$/, ''));
        return target === PROJECT_DIR || !target.startsWith(`${PROJECT_DIR}/`);
      };
      if (recursive && targets.some(reckless)) {
        return 'dangerous recursive delete. Name the exact path to remove.';
      }
      continue;
    }

    if (argv[0] !== 'git') continue;

    const { pre, sub, rest } = gitParts(argv);

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
      if (w === '--tags') {
        tagsOnly = true;
        continue;
      }
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

      let dest = w.includes(':') ? w.slice(w.lastIndexOf(':') + 1) : w;
      dest = dest
        .replace(/^\+/, '')
        .replace(/^refs\/heads\//, '')
        .replace(/^heads\//, '');

      if (dest.includes('*')) {
        return 'a wildcard refspec pushes every branch it matches, main included.';
      }
      if (dest === 'HEAD' || dest === '@') dest = currentBranch();

      if (PROTECTED.has(dest)) {
        return 'main takes changes through a PR only. Push the feature branch instead.';
      }
    }

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
