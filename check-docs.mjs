#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFEST = '.claude/config/docs-ownership.json';
const manifest = JSON.parse(readFileSync(path.join(ROOT, MANIFEST), 'utf8'));

const tracked = () =>
  execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.includes('/generated/') && !f.startsWith('node_modules'));

const failures = [];
const fail = (file, line, message) => failures.push({ file, line, message });

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function checkOwnership(files, owned) {
  for (const { phrase, owner, note } of owned) {
    if (!existsSync(path.join(ROOT, owner))) {
      fail(MANIFEST, 0, `owner "${owner}" for "${phrase}" does not exist`);
      continue;
    }
    const needle = new RegExp(
      phrase
        .split(/\s+/)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+'),
      'i',
    );
    let statedInOwner = false;
    for (const file of files.filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(path.join(ROOT, file), 'utf8');
      const found = needle.exec(text);
      if (!found) continue;
      const at = found.index;
      if (file === owner) {
        statedInOwner = true;
        continue;
      }
      fail(
        file,
        lineOf(text, at),
        `"${phrase}" is owned by ${owner} — link to it instead of restating it${note ? ` (${note})` : ''}`,
      );
    }
    if (!statedInOwner) fail(owner, 0, `owns "${phrase}" but no longer states it`);
  }
}

function checkLinks(files) {
  const link = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const file of files.filter((f) => f.endsWith('.md'))) {
    const raw = readFileSync(path.join(ROOT, file), 'utf8');
    // Fenced blocks hold examples, not links; blank them rather than dropping them so the
    // reported line numbers still point at the file the reader has open.
    const text = raw.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '));
    for (const match of text.matchAll(link)) {
      const href = match[1]
        .replace(/\s+"[^"]*"$/, '')
        .replace(/^<(.*)>$/, '$1')
        .split('#')[0]
        .trim();
      if (!href || /^[a-z]+:/i.test(href) || href.startsWith('#') || href.startsWith('/')) continue;
      if (manifest.githubRelativeLinks.includes(href)) continue;
      const target = path.resolve(path.dirname(path.join(ROOT, file)), href);
      if (!existsSync(target)) {
        fail(file, lineOf(text, match.index), `link target does not exist: ${href}`);
      }
    }
  }
}

function checkDriftProse(files, banned) {
  for (const file of files.filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(path.join(ROOT, file), 'utf8');
    for (const { pattern, why } of banned) {
      for (const match of text.matchAll(new RegExp(pattern, 'gi'))) {
        fail(file, lineOf(text, match.index), `"${match[0]}" — ${why}`);
      }
    }
  }
}

const files = tracked();

checkOwnership(files, manifest.owned);
checkLinks(files);
checkDriftProse(files, manifest.banned);

if (failures.length === 0) {
  console.log(`check-docs: ${files.length} files, no drift.`);
  process.exit(0);
}

for (const { file, line, message } of failures) {
  console.error(`${file}:${line}  ${message}`);
}
console.error(`\ncheck-docs: ${failures.length} problem(s). The rule is .claude/rules/specs.md.`);
process.exit(1);
