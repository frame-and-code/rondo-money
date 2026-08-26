const RAW_SQL_MEMBER = 'MemberExpression[property.name=/^\\$(query|execute)Raw(Unsafe)?$/]';

const MESSAGE =
  'Raw Prisma SQL bypasses the userId auto-scoping extension. Put the query behind ' +
  'ScopedRawRepository (apps/api/src/raw-sql), which supplies the scope from the request ' +
  'context — see ADR-005 and .claude/rules/security.md.';

export default function prismaRaw() {
  return { selector: RAW_SQL_MEMBER, message: MESSAGE };
}
