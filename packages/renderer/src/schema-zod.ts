/**
 * Runtime zod validators for the page schema.
 *
 * Kept in a separate module so that consumers who only need the types
 * (most of them, since schemas are imported as static JSON) don't pay
 * the ~50KB zod tax. The renderer bindings reach these via dynamic
 * `import()` only when the caller opts into runtime validation:
 *
 *   createConfiguredPage({schema, registry, validate: true})
 *
 * `fetchRemoteSchema` also imports this module on demand — remote
 * payloads are untrusted and always validated.
 */
import {z} from 'zod';
import type {ActionExpr, ComponentSchema, ConditionExpr, SchemaPatch, ValueExpr} from './schema';

const valueExprSchema: z.ZodType<ValueExpr> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.object({$: z.string()}).strict(),
    z.object({$literal: z.unknown()}).strict()
  ])
);

const conditionExprSchema: z.ZodType<ConditionExpr> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.object({eq: z.tuple([valueExprSchema, valueExprSchema])}).strict(),
    z.object({neq: z.tuple([valueExprSchema, valueExprSchema])}).strict(),
    z.object({gt: z.tuple([valueExprSchema, valueExprSchema])}).strict(),
    z.object({gte: z.tuple([valueExprSchema, valueExprSchema])}).strict(),
    z.object({lt: z.tuple([valueExprSchema, valueExprSchema])}).strict(),
    z.object({lte: z.tuple([valueExprSchema, valueExprSchema])}).strict(),
    z.object({exists: valueExprSchema}).strict(),
    z.object({and: z.array(conditionExprSchema)}).strict(),
    z.object({or: z.array(conditionExprSchema)}).strict(),
    z.object({not: conditionExprSchema}).strict()
  ])
);

const actionSingleSchema = z
  .object({
    type: z.string(),
    payload: z.record(z.string(), valueExprSchema).optional()
  })
  .strict();

const actionExprSchema: z.ZodType<ActionExpr> = z.union([
  actionSingleSchema,
  z.array(actionSingleSchema)
]) as unknown as z.ZodType<ActionExpr>;

const componentSchemaBase: z.ZodType<ComponentSchema> = z.lazy(() =>
  z
    .object({
      name: z.string().min(1),
      id: z.string().optional(),
      props: z.record(z.string(), z.unknown()).optional(),
      children: z.array(componentSchemaBase).optional(),
      slots: z.record(z.string(), z.array(componentSchemaBase)).optional(),
      when: conditionExprSchema.optional(),
      for: z
        .object({
          in: valueExprSchema,
          as: z.string().optional()
        })
        .strict()
        .optional(),
      events: z.record(z.string(), actionExprSchema).optional(),
      slot: z.string().optional()
    })
    .strict()
) as unknown as z.ZodType<ComponentSchema>;

export const pageSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1),
    components: z.array(componentSchemaBase)
  })
  .strict();

export type PageSchemaInput = z.input<typeof pageSchema>;
export type PageSchemaOutput = z.output<typeof pageSchema>;

export const schemaPatchSchema: z.ZodType<SchemaPatch> = z.lazy(() =>
  z
    .object({
      op: z.enum(['append', 'prepend', 'replace', 'remove', 'patchProps']),
      target: z.union([
        z.object({id: z.string()}).strict(),
        z.object({name: z.string()}).strict(),
        z.object({path: z.array(z.number().int().nonnegative())}).strict()
      ]),
      value: z.union([componentSchemaBase, z.record(z.string(), z.unknown())]).optional(),
      slot: z.string().optional()
    })
    .strict()
);
