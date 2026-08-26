const WRITES =
  '^(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)$';

const ASSIGNMENT_WRITE = `MemberExpression[object.property.name='assignment'][property.name=/${WRITES}/]`;

const MESSAGE =
  'An assignment is written in one place only: the move endpoint (apps/api/src/moves). ' +
  'Assigning money and moving it are the same operation, and a second writer is a second ' +
  'inverse for undo to disagree with. See .claude/rules/architecture.md.';

/// One entry of a `no-restricted-syntax` list rather than a whole config block: every
/// restriction on that rule has to reach a file in a single object, because flat config
/// replaces a rule's options instead of merging them. tenant-isolation.mjs composes them.
export default function assignmentWrites() {
  return { selector: ASSIGNMENT_WRITE, message: MESSAGE };
}
