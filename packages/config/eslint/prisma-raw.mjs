const RAW_SQL_MEMBER = 'MemberExpression[property.name=/^\\$(query|execute)Raw(Unsafe)?$/]';

const MESSAGE =
  'Raw Prisma SQL bypasses the userId auto-scoping extension. Put the query behind ' +
  'ScopedRawRepository (apps/api/src/raw-sql), which supplies the scope from the request ' +
  'context — see ADR-005 and .claude/rules/security.md.';

/// One entry of a `no-restricted-syntax` list rather than a whole config block: every
/// restriction on that rule has to reach a file in a single object, because flat config
/// replaces a rule's options instead of merging them. tenant-isolation.mjs composes them.
export default function prismaRaw() {
  return { selector: RAW_SQL_MEMBER, message: MESSAGE };
}
