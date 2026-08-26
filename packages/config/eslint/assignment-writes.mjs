const WRITES =
  '^(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)$';

const ASSIGNMENT_WRITE = `MemberExpression[object.property.name='assignment'][property.name=/${WRITES}/]`;

const MESSAGE =
  'An assignment is written in one place only: the move endpoint (apps/api/src/moves). ' +
  'Assigning money and moving it are the same operation, and a second writer is a second ' +
  'inverse for undo to disagree with. See .claude/rules/architecture.md.';

export default function assignmentWrites() {
  return { selector: ASSIGNMENT_WRITE, message: MESSAGE };
}
