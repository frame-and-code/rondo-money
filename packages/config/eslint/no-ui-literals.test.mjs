import { after, describe, it } from 'node:test';

import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';

import noUiLiterals from './no-ui-literals.mjs';

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

tester.run('no-ui-literals', noUiLiterals, {
  valid: [
    { code: 'const a = <p>{t("nav.categories")}</p>;' },
    { code: 'const a = <span aria-label={t("common.close")} />;' },
    { code: 'const a = <span>{APP_NAME}</span>;' },
    { code: 'const a = <span>{" / "}</span>;' },
    { code: 'const a = <span>{"\\u00a0"}·{"–"}</span>;' },
    { code: 'const a = <span className="text-sm font-semibold" />;' },
    { code: 'const a = <input type="text" id="amount" inputMode="decimal" />;' },
    { code: 'const a = <span title={label} />;' },
    { code: 'const a = <p>{count}</p>;' },
    { code: 'const a = <p>{busy ? t("a") : t("b")}</p>;' },
    { code: 'const a = <p>{failed && t("common.close")}</p>;' },
    { code: 'const a = <span className={open ? "flex" : "hidden"} />;' },
  ],
  invalid: [
    {
      code: 'const a = <span className="sr-only">Close</span>;',
      errors: [{ messageId: 'text' }],
    },
    {
      code: 'const a = <p>Категории</p>;',
      errors: [{ messageId: 'text' }],
    },
    {
      code: 'const a = <p>{"Save"}</p>;',
      errors: [{ messageId: 'text' }],
    },
    {
      code: 'const a = <p>{`Saved ${name}`}</p>;',
      errors: [{ messageId: 'text' }],
    },
    {
      code: 'const a = <p>{busy ? "Saving" : "Save"}</p>;',
      errors: [{ messageId: 'text' }],
    },
    {
      code: 'const a = <span>{failed && "Try again"}</span>;',
      errors: [{ messageId: 'text' }],
    },
    {
      code: 'const a = <button aria-label={open ? "Close" : label} />;',
      errors: [{ messageId: 'attribute' }],
    },
    {
      code: 'const a = <input placeholder="Search" />;',
      errors: [{ messageId: 'attribute' }],
    },
    {
      code: 'const a = <button aria-label={"Close"} />;',
      errors: [{ messageId: 'attribute' }],
    },
    {
      code: 'const a = <img alt="Logo" title="Logo" />;',
      errors: [{ messageId: 'attribute' }, { messageId: 'attribute' }],
    },
  ],
});
