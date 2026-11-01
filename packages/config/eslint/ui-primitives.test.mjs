import { after, describe, it } from 'node:test';

import { RuleTester } from 'eslint';
import { builtinRules } from 'eslint/use-at-your-own-risk';
import tseslint from 'typescript-eslint';

import { restricted } from './ui-primitives.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.afterAll = after;

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const options = restricted;

tester.run('ui-primitives', builtinRules.get('no-restricted-syntax'), {
  valid: [
    { code: 'const a = <Button onClick={go}>{label}</Button>;', options },
    {
      code: 'const a = <Item render={<button type="button" onClick={go} />}>{label}</Item>;',
      options,
    },
    { code: 'const a = <Input id="name" />;', options },
    { code: 'const a = <span role="button" />;', options },
    {
      code: 'const a = <button type="button" data-slot="row-open" aria-label={label} />;',
      options,
    },
  ],
  invalid: [
    {
      code: 'const a = <button type="button" onClick={go}>{label}</button>;',
      options,
      errors: 1,
    },
    { code: 'const a = <button type="button" aria-label={label} />;', options, errors: 1 },
    {
      code: 'const a = <Item render={<div><button type="button" /></div>} />;',
      options,
      errors: 1,
    },
    {
      code: 'const a = <button type="button" data-slot="row-closed" aria-label={label} />;',
      options,
      errors: 1,
    },
    { code: 'const a = <input data-slot="row-open" />;', options, errors: 1 },
    {
      code: 'const a = <button type="button" data-slot="row-open">{label}</button>;',
      options,
      errors: 1,
    },
    { code: 'const a = <input id="name" />;', options, errors: 1 },
    { code: 'const a = <select id="pick" />;', options, errors: 1 },
  ],
});
