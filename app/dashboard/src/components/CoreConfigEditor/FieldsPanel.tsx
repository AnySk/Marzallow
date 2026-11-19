import {
  Box,
  Button,
  Checkbox,
  Collapse,
  HStack,
  IconButton,
  Input,
  Link,
  NumberInput,
  NumberInputField,
  Select,
  Switch,
  Text,
  Tooltip,
  useDisclosure,
  VStack,
  Wrap,
} from "@chakra-ui/react";
import { FC, useEffect, useState } from "react";
import { deref, FieldInfo, fieldsOf, initialValue, JsonPath, schemaAt, SchemaNode, typeOf } from "./schema";

type Props = {
  schema: SchemaNode | null;
  doc: unknown; // parsed config (undefined while the JSON is invalid)
  path: JsonPath | null; // container under the cursor
  onEdit: (path: JsonPath, value: unknown) => void; // undefined value = remove
  onNavigate: (path: JsonPath) => void;
};

const valueAt = (doc: unknown, path: JsonPath): any =>
  path.reduce<any>((v, k) => (v == null ? undefined : v[k as any]), doc);

const segmentLabel = (doc: unknown, path: JsonPath, i: number) => {
  const key = path[i];
  if (typeof key === "number") {
    const item = valueAt(doc, path.slice(0, i + 1));
    return item?.tag ? String(item.tag) : `#${key + 1}`;
  }
  return String(key);
};

/** Side panel listing the fields of the object under the cursor. */
export const FieldsPanel: FC<Props> = ({ schema, doc, path, onEdit, onNavigate }) => {
  if (!schema) return <Text fontSize="sm" color="text-muted">Loading schema…</Text>;
  if (doc === undefined)
    return <Text fontSize="sm" color="orange.500">Fix the JSON errors to edit fields here.</Text>;
  if (!path) return null;

  const node = schemaAt(schema, doc, path);
  const value = valueAt(doc, path);
  const isArray = Array.isArray(value);

  return (
    <VStack align="stretch" spacing={3} data-testid="fields-panel">
      <Wrap spacing={1} fontSize="xs" color="text-muted">
        <Link onClick={() => onNavigate([])}>config</Link>
        {path.map((_, i) => (
          <HStack key={i} spacing={1}>
            <Text>›</Text>
            <Link onClick={() => onNavigate(path.slice(0, i + 1))}>{segmentLabel(doc, path, i)}</Link>
          </HStack>
        ))}
      </Wrap>
      {node?.description && (
        <Text fontSize="xs" color="text-muted">
          {node.description}{" "}
          {node["x-docs"] && <Link href={node["x-docs"]} isExternal color="primary.500">docs ↗</Link>}
        </Text>
      )}
      {!node && <Text fontSize="xs" color="text-muted">No schema for this part of the config.</Text>}
      {isArray ? (
        <ArrayItems schema={schema} node={node} value={value} path={path} onEdit={onEdit} onNavigate={onNavigate} />
      ) : (
        node && <ObjectFields schema={schema} node={node} value={value} path={path} onEdit={onEdit} onNavigate={onNavigate} />
      )}
    </VStack>
  );
};

const ArrayItems: FC<{ schema: SchemaNode; node?: SchemaNode; value: any[]; path: JsonPath } & Pick<Props, "onEdit" | "onNavigate">> =
  ({ schema, node, value, path, onEdit, onNavigate }) => {
    const items = deref(schema, node?.items);
    return (
      <VStack align="stretch" spacing={1}>
        {value.map((item, i) => (
          <HStack key={i} justifyContent="space-between" fontSize="sm">
            <Text isTruncated>{item?.tag || item?.protocol || (typeof item === "object" ? `#${i + 1}` : JSON.stringify(item))}</Text>
            {typeof item === "object" && item !== null && (
              <Button size="xs" variant="outline" onClick={() => onNavigate([...path, i])}>Open</Button>
            )}
          </HStack>
        ))}
        {items && (
          <Button size="xs" variant="ghost" alignSelf="start"
            onClick={() => onEdit([...path, value.length], initialValue(items))}>
            + Add item
          </Button>
        )}
      </VStack>
    );
  };

const ObjectFields: FC<{ schema: SchemaNode; node: SchemaNode; value: any; path: JsonPath } & Pick<Props, "onEdit" | "onNavigate">> =
  ({ schema, node, value, path, onEdit, onNavigate }) => {
    const fields = fieldsOf(schema, node, value);
    const relevant = fields.filter((f) => f.present || f.relevant);
    const other = fields.filter((f) => !f.present && !f.relevant);
    const { isOpen, onToggle } = useDisclosure();
    return (
      <VStack align="stretch" spacing={2}>
        {relevant.map((f) => (
          <FieldRow key={f.key} root={schema} field={f} value={value?.[f.key]} path={[...path, f.key]} onEdit={onEdit} onNavigate={onNavigate} />
        ))}
        {!!other.length && (
          <>
            <Button size="xs" variant="link" alignSelf="start" onClick={onToggle}>
              {isOpen ? "Hide" : "Show"} fields not used with the current settings ({other.length})
            </Button>
            <Collapse in={isOpen} animateOpacity>
              <VStack align="stretch" spacing={2} opacity={0.75}>
                {other.map((f) => (
                  <FieldRow key={f.key} root={schema} field={f} value={undefined} path={[...path, f.key]} onEdit={onEdit} onNavigate={onNavigate} />
                ))}
              </VStack>
            </Collapse>
          </>
        )}
      </VStack>
    );
  };

const FieldRow: FC<{ root: SchemaNode; field: FieldInfo; value: any; path: JsonPath } & Pick<Props, "onEdit" | "onNavigate">> =
  ({ root, field, value, path, onEdit, onNavigate }) => {
    const { schema, present, key } = field;
    const kind = typeOf(schema);
    const items = deref(root, schema.items);
    const label = (
      <Tooltip label={schema.description} placement="left" openDelay={300} isDisabled={!schema.description}>
        <Text fontSize="xs" fontFamily="mono" fontWeight={present ? "semibold" : "normal"}
          color={present ? undefined : "gray.500"} textDecoration={schema.deprecated ? "line-through" : undefined}>
          {key}
        </Text>
      </Tooltip>
    );
    const remove = present ? (
      <IconButton aria-label={`remove ${key}`} size="xs" variant="ghost" onClick={() => onEdit(path, undefined)}>
        <Text fontSize="sm">×</Text>
      </IconButton>
    ) : null;

    let control: React.ReactNode;
    if (kind === "enum") {
      control = (
        <Select size="xs" aria-label={key} value={present ? JSON.stringify(value) : ""}
          onChange={(e) => onEdit(path, e.target.value === "" ? undefined : JSON.parse(e.target.value))}>
          <option value="">{present ? "(remove)" : "— add —"}</option>
          {schema.enum!.map((v) => (
            <option key={JSON.stringify(v)} value={JSON.stringify(v)}>{String(v)}</option>
          ))}
        </Select>
      );
    } else if (kind === "boolean") {
      control = <Switch size="sm" aria-label={key} isChecked={!!value} onChange={(e) => onEdit(path, e.target.checked)} />;
    } else if (kind === "integer" || kind === "number") {
      control = <CommitInput numeric aria={key} value={present ? String(value) : ""}
        placeholder={schema.default !== undefined ? String(schema.default) : "add"}
        onCommit={(v) => onEdit(path, v === "" ? undefined : Number(v))} />;
    } else if (kind === "string") {
      control = <CommitInput aria={key} value={present ? String(value) : ""}
        placeholder={schema.default !== undefined ? String(schema.default) : (schema.examples?.[0] as string) || "add"}
        onCommit={(v) => onEdit(path, v === "" ? undefined : v)} />;
    } else if (kind === "array" && items?.enum) {
      const options = items.enum;
      const current: unknown[] = Array.isArray(value) ? value : [];
      control = (
        <Wrap spacing={2}>
          {options.map((o) => (
            <Checkbox key={String(o)} size="sm" isChecked={current.includes(o)}
              onChange={(e) => onEdit(path, e.target.checked ? [...current, o] : current.filter((x) => x !== o))}>
              <Text fontSize="xs">{String(o)}</Text>
            </Checkbox>
          ))}
        </Wrap>
      );
    } else if (kind === "array" && ["string", "integer", "number"].includes(typeOf(items) || "")) {
      const numeric = typeOf(items) !== "string";
      control = <CommitInput aria={key} value={Array.isArray(value) ? value.join(", ") : ""}
        placeholder="comma-separated"
        onCommit={(v) => onEdit(path, v.trim() === "" ? undefined
          : v.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (numeric ? Number(s) : s)))} />;
    } else if (kind === "object" || kind === "array") {
      control = present ? (
        <Button size="xs" variant="outline" onClick={() => onNavigate(path)}>Open</Button>
      ) : (
        <Button size="xs" variant="ghost" onClick={() => { onEdit(path, initialValue(schema)); onNavigate(path); }}>+ Add</Button>
      );
    } else {
      control = present ? (
        <Text fontSize="xs" color="text-muted" isTruncated>{JSON.stringify(value)}</Text>
      ) : (
        <Button size="xs" variant="ghost" onClick={() => onEdit(path, initialValue(schema))}>+ Add</Button>
      );
    }

    return (
      <Box>
        <HStack justifyContent="space-between" spacing={1}>
          {label}
          {remove}
        </HStack>
        {control}
        {present && !field.relevant && (
          <Text fontSize="xs" color="orange.500" mt={1}>
            Not used with the current settings (e.g. another network or security is selected).
          </Text>
        )}
      </Box>
    );
  };

/** Text/number input that applies on Enter or blur (not on every keystroke). */
const CommitInput: FC<{ value: string; onCommit: (v: string) => void; placeholder?: string; numeric?: boolean; aria: string }> =
  ({ value, onCommit, placeholder, numeric, aria }) => {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    const commit = () => { if (draft !== value) onCommit(draft); };
    const props = {
      size: "xs" as const,
      value: draft,
      placeholder,
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") commit(); },
    };
    return numeric ? (
      <NumberInput {...props} onChange={(v) => setDraft(v)}>
        <NumberInputField aria-label={aria} />
      </NumberInput>
    ) : (
      <Input {...props} aria-label={aria} onChange={(e) => setDraft(e.target.value)} />
    );
  };
