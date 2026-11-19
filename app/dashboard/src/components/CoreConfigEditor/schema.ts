// Resolves the Xray config schema (JSON Schema subset + x-switch / x-show-if /
// x-docs extensions, see xray-schema.json) against a JSON path in the config.

export type SchemaNode = {
  $ref?: string;
  type?: string | string[];
  description?: string;
  enum?: (string | number | boolean | null)[];
  default?: unknown;
  examples?: unknown[];
  properties?: Record<string, SchemaNode>;
  required?: string[];
  items?: SchemaNode;
  additionalProperties?: boolean | SchemaNode;
  definitions?: Record<string, SchemaNode>;
  deprecated?: boolean;
  oneOf?: SchemaNode[];
  anyOf?: SchemaNode[];
  "x-switch"?: { property: string; on: string; cases: Record<string, SchemaNode> }[];
  "x-show-if"?: Record<string, (string | number | boolean)[]>;
  "x-docs"?: string;
};

export type JsonPath = (string | number)[];

export const deref = (root: SchemaNode, node?: SchemaNode, depth = 0): SchemaNode | undefined => {
  if (!node || depth > 20) return node;
  if (node.$ref?.startsWith("#/definitions/")) {
    const target = root.definitions?.[node.$ref.slice("#/definitions/".length)];
    // keep local description/docs on top of the referenced definition
    const { $ref, ...local } = node;
    return deref(root, { ...target, ...local }, depth + 1);
  }
  return node;
};

const valueAt = (doc: unknown, path: JsonPath): unknown =>
  path.reduce<any>((value, key) => (value == null ? undefined : value[key as any]), doc);

/** The schema for a child property, honouring x-switch (e.g. settings by protocol). */
export const childSchema = (
  root: SchemaNode,
  parent: SchemaNode | undefined,
  parentValue: unknown,
  key: string | number
): SchemaNode | undefined => {
  const node = deref(root, parent);
  if (!node) return undefined;
  if (typeof key === "number") return deref(root, node.items);
  const switched = node["x-switch"]?.find((s) => s.property === key);
  if (switched && parentValue && typeof parentValue === "object") {
    const discriminator = (parentValue as any)[switched.on];
    const match = switched.cases[String(discriminator)];
    if (match) return deref(root, match);
  }
  if (node.properties?.[key]) return deref(root, node.properties[key]);
  if (node.additionalProperties && typeof node.additionalProperties === "object")
    return deref(root, node.additionalProperties);
  return undefined;
};

/** Schema node for `path` in `doc` (undefined if the schema doesn't know it). */
export const schemaAt = (root: SchemaNode, doc: unknown, path: JsonPath): SchemaNode | undefined => {
  let node: SchemaNode | undefined = deref(root, root);
  for (let i = 0; i < path.length; i++) {
    node = childSchema(root, node, valueAt(doc, path.slice(0, i)), path[i]);
    if (!node) return undefined;
  }
  return node;
};

export type FieldInfo = {
  key: string;
  schema: SchemaNode;
  present: boolean;
  relevant: boolean; // false when x-show-if doesn't match (e.g. wsSettings while network=grpc)
};

/** Properties an object may have, existing ones first, relevant before irrelevant. */
export const fieldsOf = (root: SchemaNode, objectSchema: SchemaNode | undefined, value: any): FieldInfo[] => {
  const node = deref(root, objectSchema);
  if (!node) return [];
  const keys = new Set<string>([
    ...Object.keys(node.properties || {}),
    ...(node["x-switch"] || []).map((s) => s.property),
  ]);
  const fields: FieldInfo[] = [];
  keys.forEach((key) => {
    const schema = childSchema(root, node, value, key) || {};
    const showIf = node.properties?.[key]?.["x-show-if"];
    const relevant = !showIf || Object.entries(showIf).every(([sibling, allowed]) =>
      allowed.includes(value?.[sibling] ?? defaultOf(root, node, sibling)));
    fields.push({ key, schema, present: value != null && key in value, relevant });
  });
  // keys present in the document but unknown to the schema
  if (value && typeof value === "object" && !Array.isArray(value))
    Object.keys(value).forEach((key) => {
      if (!keys.has(key)) {
        const schema = childSchema(root, node, value, key);
        fields.push({ key, schema: schema || {}, present: true, relevant: true });
      }
    });
  const rank = (f: FieldInfo) => (f.present ? 0 : f.relevant ? 1 : 2);
  return fields.sort((a, b) => rank(a) - rank(b));
};

const defaultOf = (root: SchemaNode, node: SchemaNode, key: string) =>
  deref(root, node.properties?.[key])?.default;

export const typeOf = (schema?: SchemaNode): string | undefined => {
  if (!schema) return undefined;
  if (schema.enum) return "enum";
  const t = Array.isArray(schema.type) ? schema.type.find((x) => x !== "null") : schema.type;
  if (t) return t;
  if (schema.properties || schema["x-switch"]) return "object";
  if (schema.items) return "array";
  return undefined;
};

/** A sensible initial value when adding a field. */
export const initialValue = (schema: SchemaNode): unknown => {
  if (schema.default !== undefined) return schema.default;
  switch (typeOf(schema)) {
    case "enum": return schema.enum![0];
    case "boolean": return false;
    case "integer":
    case "number": return 0;
    case "array": return [];
    case "object": return {};
    default: return (schema.examples?.[0] as any) ?? "";
  }
};

/** Problems in a value against its schema node (only the checks an editor needs). */
export const problemsFor = (schema: SchemaNode | undefined, value: unknown): string | undefined => {
  if (!schema || value === undefined) return undefined;
  if (schema.enum && !schema.enum.includes(value as any))
    return `Expected one of: ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`;
  const types = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : [];
  if (!types.length) return undefined;
  const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const ok = types.some((t) =>
    t === actual || (t === "integer" && actual === "number" && Number.isInteger(value)) ||
    (t === "number" && actual === "number"));
  return ok ? undefined : `Expected ${types.join(" or ")}, got ${actual}`;
};
