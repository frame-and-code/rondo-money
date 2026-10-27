import { join } from 'node:path';

import { ESLint, type Linter } from 'eslint';

const API_ROOT = join(__dirname, '..');

const DOMAIN_FILE = join(API_ROOT, 'src/accounts/accounts.service.ts');
const RAW_SQL_FILE = join(API_ROOT, 'src/raw-sql/scoped-raw.repository.ts');

const RAW_READ = [
  "import { Prisma } from '@rondo/db';",
  '',
  'export async function leak(client: {',
  '  $queryRaw<T>(query: Prisma.Sql): Promise<T>;',
  '}): Promise<unknown> {',
  '  return client.$queryRaw<unknown>(Prisma.sql`SELECT 1`);',
  '}',
  '',
].join('\n');

const UNDER_DIRECTIVE = RAW_READ.replace(
  '  return client.$queryRaw',
  '  // eslint-disable-next-line no-restricted-syntax\n  return client.$queryRaw',
);

describe('the lint configuration of the api', () => {
  let eslint: ESLint;

  const messagesOf = async (text: string, filePath: string): Promise<Linter.LintMessage[]> => {
    const [result] = await eslint.lintText(text, { filePath });
    if (result === undefined) {
      throw new Error(`ESLint returned no result for ${filePath}`);
    }

    return result.messages;
  };

  const rawReadErrors = (messages: Linter.LintMessage[]): Linter.LintMessage[] =>
    messages.filter(
      (message) =>
        message.severity === 2 &&
        message.ruleId === 'no-restricted-syntax' &&
        message.message.includes('ScopedRawRepository'),
    );

  beforeAll(() => {
    eslint = new ESLint({ cwd: API_ROOT });
  });

  it('refuses a raw read outside the raw-sql module', async () => {
    const messages = await messagesOf(RAW_READ, DOMAIN_FILE);

    expect(messages.filter((message) => message.fatal)).toEqual([]);
    expect(rawReadErrors(messages)).toHaveLength(1);
  });

  it('lets the raw-sql module read raw, so the refusal above is about the place', async () => {
    const messages = await messagesOf(RAW_READ, RAW_SQL_FILE);

    expect(messages.filter((message) => message.fatal)).toEqual([]);
    expect(rawReadErrors(messages)).toEqual([]);
  });

  it('keeps refusing the raw read when a directive asks to switch the rule off, and reports the directive', async () => {
    const messages = await messagesOf(UNDER_DIRECTIVE, DOMAIN_FILE);

    expect(messages.filter((message) => message.fatal)).toEqual([]);
    expect(rawReadErrors(messages)).toHaveLength(1);
    expect(
      messages
        .filter((message) => message.message.includes("because you have 'noInlineConfig' setting"))
        .map((message) => ({ ruleId: message.ruleId, severity: message.severity })),
    ).toEqual([{ ruleId: null, severity: 1 }]);
  });
});
