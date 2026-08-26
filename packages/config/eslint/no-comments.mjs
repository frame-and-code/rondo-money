const MACHINE_READ = [
  'eslint-disable',
  'eslint-enable',
  'eslint-env',
  '@ts-',
  '<reference',
  'prettier-ignore',
  '@type',
  '@typedef',
  '@param',
  '@returns',
  '@satisfies',
  '@template',
  '@import',
  '@jest-environment',
  'v8 ignore',
  'c8 ignore',
  'istanbul ignore',
  'global ',
  'globals ',
];

const SELF_EXEMPTION = /eslint-disable[a-z-]*[^\n]*\brondo\/no-comments\b/;

const SELF_EXEMPTION_MESSAGE =
  'Disabling this rule is the thing it exists to stop. Delete the comment instead, or move ' +
  'what it says into a name, the Notion ticket, or the rule that owns the pattern.';

const MESSAGE =
  'Code carries no comments here. Reach for a name, a smaller function or a type that makes ' +
  'the wrong value unrepresentable; a decision belongs in the Notion ticket that took it. ' +
  'Only what a tool reads may stay, such as eslint-disable, @ts-expect-error or a JSDoc type.';

function isMachineRead(comment) {
  const text = comment.value.replace(/^[/*\s]+/, '');

  return MACHINE_READ.some((prefix) => text.startsWith(prefix));
}

function onlyWhitespaceBefore(line, column) {
  return line.slice(0, column).trim() === '';
}

function onlyWhitespaceAfter(line, column) {
  return line.slice(column).trim() === '';
}

export default {
  meta: {
    type: 'suggestion',
    fixable: 'whitespace',
    schema: [],
    messages: { noComments: MESSAGE, noSelfExemption: SELF_EXEMPTION_MESSAGE },
  },
  create(context) {
    const source = context.sourceCode;

    return {
      Program() {
        for (const comment of source.getAllComments()) {
          if (SELF_EXEMPTION.test(comment.value)) {
            context.report({ loc: comment.loc, messageId: 'noSelfExemption' });
            continue;
          }

          if (isMachineRead(comment)) {
            continue;
          }

          const first = source.lines[comment.loc.start.line - 1] ?? '';
          const last = source.lines[comment.loc.end.line - 1] ?? '';
          const standsAlone =
            onlyWhitespaceBefore(first, comment.loc.start.column) &&
            onlyWhitespaceAfter(last, comment.loc.end.column);

          context.report({
            loc: comment.loc,
            messageId: 'noComments',
            fix(fixer) {
              const [start, end] = comment.range;

              if (standsAlone) {
                const lineStart = start - comment.loc.start.column;
                const afterNewline = source.text[end] === '\r' ? end + 2 : end + 1;

                return fixer.removeRange([lineStart, Math.min(afterNewline, source.text.length)]);
              }

              let from = start;
              while (from > 0 && /[ \t]/.test(source.text[from - 1] ?? '')) {
                from -= 1;
              }

              return fixer.removeRange([from, end]);
            },
          });
        }
      },
    };
  },
};
