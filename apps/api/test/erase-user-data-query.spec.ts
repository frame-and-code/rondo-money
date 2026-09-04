import { Prisma } from '@rondo/db';

import { eraseUserDataStatements } from '@/me/erase-user-data.query';
import { SCOPED_MODELS } from '@/prisma/scoped-models';

const USER = 'user_2rondoEraseQueryAaaaaaaaaaa';
const OTHER = 'user_2rondoEraseQueryBbbbbbbbbbb';

const KEY = 'the-dialog-opened-once';

describe('the statements that erase everything a caller owns', () => {
  it('covers every model the app scopes to a caller, so a new table cannot be left behind', () => {
    const written = eraseUserDataStatements({ userId: USER }, KEY);

    expect(new Set(written.map(({ model }) => model))).toEqual(new Set(SCOPED_MODELS));
    expect(written).toHaveLength(SCOPED_MODELS.size);
  });

  it('carries the caller as a bound parameter and never as text', () => {
    const written = eraseUserDataStatements({ userId: USER }, KEY);

    const unbound = written
      .filter(({ statement }) => !statement.values.includes(USER))
      .map(({ model }) => model);
    const interpolated = written
      .filter(({ statement }) => statement.text.includes(USER))
      .map(({ model }) => model);

    expect({ unbound, interpolated }).toEqual({ unbound: [], interpolated: [] });
  });

  it('changes only its values when the caller changes, so no scope can be baked in', () => {
    const mine = eraseUserDataStatements({ userId: USER }, KEY);
    const theirs = eraseUserDataStatements({ userId: OTHER }, KEY);

    expect(theirs.map(({ statement }) => statement.text)).toEqual(
      mine.map(({ statement }) => statement.text),
    );
    expect(theirs.every(({ statement }) => statement.values.includes(OTHER))).toBe(true);
    expect(theirs.some(({ statement }) => statement.values.includes(USER))).toBe(false);
  });

  it('names the key the running request claimed, so that one row can be spared', () => {
    const written = eraseUserDataStatements({ userId: USER }, KEY);
    const keys = written.find(({ model }) => model === Prisma.ModelName.IdempotencyKey);

    expect(keys?.statement.values).toEqual(expect.arrayContaining([USER, KEY]));
    expect(keys?.statement.text).not.toContain(KEY);
  });
});

describe('the table each statement reaches', () => {
  const snakeOf = (model: string): string => model.replace(/(?<!^)([A-Z])/g, '_$1').toLowerCase();

  it('is the one its model maps to, so a copied line cannot point at a neighbour', () => {
    const written = eraseUserDataStatements({ userId: USER }, KEY);

    const mismatched = written
      .map(({ model, statement }) => ({
        model,
        table: /delete from "?(\w+)"?/i.exec(statement.text)?.[1],
      }))
      .filter(({ model, table }) => table !== snakeOf(model));

    expect(mismatched).toEqual([]);
  });
});
