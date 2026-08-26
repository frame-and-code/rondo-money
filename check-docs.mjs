import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFEST = '.claude/config/docs-ownership.json';
const manifest = JSON.parse(readFileSync(path.join(ROOT, MANIFEST), 'utf8'));

const failures = [];
const fail = (file, line, message) => failures.push({ file, line, message });
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

const tracked = (...globs) =>
  execFileSync('git', ['ls-files', ...globs], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.includes('/generated/'));

const blank = (m) => m.replace(/[^\n]/g, ' ');
const FENCE = /```[\s\S]*?```/g;
const MANAGED = /^[ \t]*<!--\s*BEGIN:(\S+)\s*-->[\s\S]*?^[ \t]*<!--\s*END:\1\s*-->/gm;
const INLINE_CODE = /`[^`\n]*`/g;

const blankFences = (text) => text.replace(FENCE, blank).replace(MANAGED, blank);
const narrativeOf = (prose) => prose.replace(INLINE_CODE, blank);

function load(files) {
  const corpus = new Map();
  for (const file of files) {
    let raw;
    try {
      raw = readFileSync(path.join(ROOT, file), 'utf8');
    } catch {
      fail(file, 0, 'tracked by git but missing from the working tree');
      continue;
    }
    const prose = blankFences(raw);
    corpus.set(file, { raw, prose, narrative: narrativeOf(prose) });
  }
  return corpus;
}

const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phraseRe = (phrase) => new RegExp(phrase.split(/\s+/).map(escape).join('\\s+'), 'i');

const slug = (heading) =>
  heading
    .replace(/^#+\s*/, '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/ /g, '-');

function checkOwnership(corpus, owned) {
  for (const { phrase, owner, note } of owned) {
    if (!corpus.has(owner) && !existsSync(path.join(ROOT, owner))) {
      fail(MANIFEST, 0, `owner "${owner}" for "${phrase}" does not exist`);
      continue;
    }
    const needle = phraseRe(phrase);
    let statedInOwner = false;
    for (const [file, { prose }] of corpus) {
      const found = needle.exec(prose);
      if (!found) continue;
      if (file === owner) {
        statedInOwner = true;
        continue;
      }
      const why = note ? ` (${note})` : '';
      fail(
        file,
        lineOf(prose, found.index),
        `"${phrase}" is owned by ${owner} — link to it instead of restating it${why}`,
      );
    }
    if (!statedInOwner) fail(owner, 0, `owns "${phrase}" but no longer states it`);
  }
}

function checkLinks(corpus) {
  const link = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const [file, { prose }] of corpus) {
    if (!file.endsWith('.md')) continue;
    for (const match of prose.matchAll(link)) {
      const [, target] = match;
      const cleaned = target.replace(/\s+"[^"]*"$/, '').replace(/^<(.*)>$/, '$1');
      const [href, anchor] = cleaned.split('#');
      if (/^[a-z]+:/i.test(cleaned) || cleaned.startsWith('/')) continue;
      if (manifest.githubRelativeLinks.includes(cleaned)) continue;

      const at = lineOf(prose, match.index);
      const resolved = href
        ? path.resolve(path.dirname(path.join(ROOT, file)), href)
        : path.join(ROOT, file);
      if (!existsSync(resolved)) {
        fail(file, at, `link target does not exist: ${href}`);
        continue;
      }
      if (!anchor || !resolved.endsWith('.md')) continue;
      const rel = path.relative(ROOT, resolved);
      const text = corpus.get(rel)?.prose ?? blankFences(readFileSync(resolved, 'utf8'));
      const headings = text
        .split('\n')
        .filter((l) => l.startsWith('#'))
        .map(slug);
      if (!headings.includes(anchor.toLowerCase())) {
        fail(file, at, `no heading "#${anchor}" in ${href || path.basename(file)}`);
      }
    }
  }
}

const SKIP_SCAN = /(^|\/)pnpm-lock\.yaml$/;

function checkForbidden(files, forbidden) {
  const patterns = forbidden.map(({ word, why }) => ({
    re: new RegExp(`\\b${escape(word)}\\b`, 'gi'),
    why,
  }));
  for (const file of files) {
    if (file === MANIFEST || SKIP_SCAN.test(file)) continue;
    let raw;
    try {
      raw = readFileSync(path.join(ROOT, file), 'utf8');
    } catch {
      continue;
    }
    for (const { re, why } of patterns) {
      for (const match of raw.matchAll(re)) {
        fail(file, lineOf(raw, match.index), `"${match[0]}" is never written here: ${why}`);
      }
    }
  }
}

function checkDriftProse(corpus, banned) {
  const patterns = banned.map(({ pattern, why }) => ({ re: new RegExp(pattern, 'gi'), why }));
  for (const [file, { narrative }] of corpus) {
    for (const { re, why } of patterns) {
      for (const match of narrative.matchAll(re)) {
        fail(file, lineOf(narrative, match.index), `"${match[0]}": ${why}`);
      }
    }
  }
}

const corpus = load(
  [...tracked('*.md'), ...tracked('.claude/config/*.json')].filter((f) => f !== MANIFEST),
);

checkOwnership(corpus, manifest.owned);
checkLinks(corpus);
checkDriftProse(corpus, manifest.banned);
checkForbidden(tracked(), manifest.forbidden);

if (failures.length === 0) {
  console.log(`check-docs: ${corpus.size} files, no drift.`);
  process.exit(0);
}

for (const { file, line, message } of failures) console.error(`${file}:${line}  ${message}`);
console.error(`\ncheck-docs: ${failures.length} problem(s). The rule is .claude/rules/specs.md.`);
process.exit(1);
