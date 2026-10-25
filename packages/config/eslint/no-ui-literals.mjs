const READ_ALOUD = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'placeholder',
  'title',
]);

const LETTER = /\p{L}/u;

const TEXT_MESSAGE =
  'Text a reader sees goes through the dictionaries in src/i18n, in every language at once. ' +
  'Add a key to ru, en and pl and render it with t(), or name a constant for what is not ' +
  'translated, such as the product name.';

const ATTRIBUTE_MESSAGE =
  'A label, a placeholder or a title is read by someone too, a screen reader included. Take ' +
  'it from the dictionaries in src/i18n with t(), never as a literal.';

function spellsWords(node) {
  if (node === null || node === undefined) return false;
  if (node.type === 'Literal') return typeof node.value === 'string' && LETTER.test(node.value);
  if (node.type === 'TemplateLiteral') {
    return node.quasis.some((quasi) => LETTER.test(quasi.value.cooked ?? quasi.value.raw));
  }
  if (node.type === 'ConditionalExpression') {
    return spellsWords(node.consequent) || spellsWords(node.alternate);
  }
  if (node.type === 'LogicalExpression' || node.type === 'BinaryExpression') {
    return spellsWords(node.left) || spellsWords(node.right);
  }

  return false;
}

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: { text: TEXT_MESSAGE, attribute: ATTRIBUTE_MESSAGE },
  },
  create(context) {
    return {
      JSXText(node) {
        if (LETTER.test(node.value)) {
          context.report({ node, messageId: 'text' });
        }
      },
      JSXExpressionContainer(node) {
        if (node.parent?.type === 'JSXAttribute') return;
        if (spellsWords(node.expression)) {
          context.report({ node, messageId: 'text' });
        }
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !READ_ALOUD.has(node.name.name)) return;

        const value =
          node.value?.type === 'JSXExpressionContainer' ? node.value.expression : node.value;

        if (spellsWords(value)) {
          context.report({ node, messageId: 'attribute' });
        }
      },
    };
  },
};
