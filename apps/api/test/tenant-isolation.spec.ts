import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const PRISMA_SERVICE = ['**/prisma/prisma.service', '@/prisma/prisma.service'];
const SCOPED_PRISMA = ['**/prisma/scoped-prisma', '@/prisma/scoped-prisma'];

interface RestrictedPattern {
  group?: string[];
}

const workspace = join(__dirname, '..');
const eslintBinary = join(
  dirname(createRequire(__filename).resolve('eslint/package.json')),
  'bin/eslint.js',
);

/// ESLint is run as a process rather than through its API: it loads a flat config by dynamic
/// import, which jest cannot do, and what is worth checking is the config the gate actually
/// resolves rather than one rebuilt here. The binary is resolved rather than assumed, and the
/// workspace is named, because the root config answers differently for the same paths.
function restrictedIn(file: string): string[] {
  const printed = execFileSync(process.execPath, [eslintBinary, '--print-config', file], {
    cwd: workspace,
    encoding: 'utf8',
  });
  const config: unknown = JSON.parse(printed);

  if (typeof config !== 'object' || config === null || !('rules' in config)) {
    throw new Error(`ESLint printed no rules for ${file}`);
  }

  const { rules } = config;
  if (typeof rules !== 'object' || rules === null) {
    throw new Error(`ESLint printed no rules for ${file}`);
  }

  const rule: unknown = Reflect.get(rules, 'no-restricted-imports');
  if (!Array.isArray(rule) || typeof rule[1] !== 'object' || rule[1] === null) {
    return [];
  }

  // Severity first: a later block that only turns the rule off leaves its options in place, so
  // reading the patterns alone cannot tell a restriction from a rule nobody enforces.
  if (rule[0] !== 'error' && rule[0] !== 2) {
    return [];
  }

  const patterns: unknown = Reflect.get(rule[1], 'patterns');

  return Array.isArray(patterns)
    ? patterns.flatMap((pattern: RestrictedPattern) => pattern.group ?? []).sort()
    : [];
}

describe('the import restrictions that keep the wrong client out of domain code', () => {
  // Both restrictions set one rule, and flat config replaces a rule's options rather than
  // merging them, so two config blocks would leave only the last standing. In silence.
  it('restricts both clients in domain code', () => {
    expect(restrictedIn('src/user-settings/user-settings.service.ts')).toEqual(
      [...PRISMA_SERVICE, ...SCOPED_PRISMA].sort(),
    );
  });

  it('lets the mutation service hold the client it opens its transaction from', () => {
    expect(restrictedIn('src/mutations/mutation.service.ts')).toEqual([...PRISMA_SERVICE].sort());
  });

  it('lets the raw repository hold the unscoped client', () => {
    expect(restrictedIn('src/raw-sql/scoped-raw.repository.ts')).toEqual([...SCOPED_PRISMA].sort());
  });

  it('reports nothing where the rule is turned off rather than the patterns dropped', () => {
    expect(restrictedIn('src/prisma/prisma.module.ts')).toEqual([]);
  });
});
