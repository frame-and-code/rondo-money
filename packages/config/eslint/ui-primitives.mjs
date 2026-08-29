const REPLACEMENTS = {
  select: 'Select from @rondo/ui/components/ui/select',
  input: 'Input, or InputGroupInput inside a composed field, from @rondo/ui',
  textarea: 'Textarea, or InputGroupTextarea inside a composed field, from @rondo/ui',
  dialog: 'Dialog from @rondo/ui/components/ui/dialog',
};

const restricted = Object.entries(REPLACEMENTS).map(([element, replacement]) => ({
  selector: `JSXOpeningElement > JSXIdentifier[name="${element}"]`,
  message:
    `A bare <${element}> is a second design system: it carries none of the theme's radii, ` +
    `focus ring or icons, and it drifts from every other control on the screen. Use ` +
    `${replacement}, or add the missing primitive with \`pnpm dlx shadcn@latest add\`.`,
}));

export default {
  files: ['**/*.tsx'],
  rules: {
    'no-restricted-syntax': ['error', ...restricted],
  },
};
