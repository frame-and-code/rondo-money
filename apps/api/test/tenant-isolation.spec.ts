import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const PRISMA_SERVICE = ['**/prisma/prisma.service', '@/prisma/prisma.service'];
const SCOPED_PRISMA = ['**/prisma/scoped-prisma', '@/prisma/scoped-prisma'];

interface RestrictedPattern {
  group?: string[];
}

interface RestrictedSelector {
  selector?: string;
}

const workspace = join(__dirname, '..');
const eslintBinary = join(
  dirname(createRequire(__filename).resolve('eslint/package.json')),
  'bin/eslint.js',
);

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

  if (rule[0] !== 'error' && rule[0] !== 2) {
    return [];
  }

  const patterns: unknown = Reflect.get(rule[1], 'patterns');

  return Array.isArray(patterns)
    ? patterns.flatMap((pattern: RestrictedPattern) => pattern.group ?? []).sort()
    : [];
}

function restrictedSyntaxIn(file: string): string[] {
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

  const rule: unknown = Reflect.get(rules, 'no-restricted-syntax');
  if (!Array.isArray(rule) || (rule[0] !== 'error' && rule[0] !== 2)) {
    return [];
  }

  return rule
    .slice(1)
    .map((entry: RestrictedSelector) => entry.selector ?? '')
    .sort();
}

const RAW_SQL = 'MemberExpression[property.name=/^\\$(query|execute)Raw(Unsafe)?$/]';

const ASSIGNMENT_WRITE =
  "MemberExpression[object.property.name='assignment'][property.name=/^(create|createMany|" +
  'createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)$/]';

describe('the syntax restrictions that keep a second writer out of the assignment table', () => {
  it('refuses both raw SQL and an assignment write in ordinary domain code', () => {
    expect(restrictedSyntaxIn('src/budgets/budgets.service.ts')).toEqual(
      [RAW_SQL, ASSIGNMENT_WRITE].sort(),
    );
  });

  it('lets the move endpoint write an assignment, and nothing else about it', () => {
    expect(restrictedSyntaxIn('src/moves/moves.service.ts')).toEqual([RAW_SQL]);
  });

  it('still refuses an assignment write inside the raw-SQL repository', () => {
    expect(restrictedSyntaxIn('src/raw-sql/scoped-raw.repository.ts')).toEqual([ASSIGNMENT_WRITE]);
  });

  it('leaves fixtures free to write one, since a test builds the state it reads', () => {
    expect(restrictedSyntaxIn('test/moves.integration.spec.ts')).toEqual([RAW_SQL]);
  });
});

describe('the import restrictions that keep the wrong client out of domain code', () => {
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
