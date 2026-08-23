import { Prisma, type PrismaClient } from '@rondo/db';

interface ModelDelegate {
  fields: Record<string, unknown>;
}

function isModelDelegate(value: unknown): value is ModelDelegate {
  return typeof value === 'object' && value !== null && 'fields' in value;
}

export function fieldsOf(client: PrismaClient, model: string): Record<string, unknown> {
  const property = model.charAt(0).toLowerCase() + model.slice(1);
  const candidate: unknown = Reflect.get(client, property);

  if (!isModelDelegate(candidate)) {
    throw new Error(
      `Cannot read the fields of model ${model}: the generated client has no delegate ` +
        `"${property}". Either the migration that creates it is missing, or Prisma's ` +
        'delegate naming changed.',
    );
  }

  return candidate.fields;
}

export function modelsCarrying(client: PrismaClient, field: string): Prisma.ModelName[] {
  return Object.values(Prisma.ModelName).filter((model) => field in fieldsOf(client, model));
}
