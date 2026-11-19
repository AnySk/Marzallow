import { autocompletion, Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";

// Insert `text`, swallowing the closing quote auto-inserted by closeBrackets.
const applyText = (text: string) => (view: EditorView, _c: Completion, from: number, to: number) => {
  const end = view.state.doc.sliceString(to, to + 1) === '"' ? to + 1 : to;
  view.dispatch({ changes: { from, to: end, insert: text }, selection: { anchor: from + text.length } });
};
import { json } from "@codemirror/lang-json";
import { Diagnostic, linter, lintGutter } from "@codemirror/lint";
import { Extension } from "@codemirror/state";
import { EditorView, hoverTooltip } from "@codemirror/view";
import {
  findNodeAtLocation,
  findNodeAtOffset,
  getLocation,
  getNodePath,
  getNodeValue,
  Node,
  parse,
  parseTree,
  printParseErrorCode,
  ParseError,
} from "jsonc-parser";
import { childSchema, deref, fieldsOf, JsonPath, problemsFor, schemaAt, SchemaNode, typeOf } from "./schema";

const parseLoose = (text: string) => parse(text, [], { allowTrailingComma: true });

/** Path of the object (or array) that encloses `offset`. */
export const enclosingContainerPath = (text: string, offset: number): JsonPath | null => {
  const tree = parseTree(text, [], { allowTrailingComma: true });
  if (!tree) return null;
  let node: Node | undefined = findNodeAtOffset(tree, offset, true);
  while (node && node.type !== "object" && node.type !== "array") node = node.parent;
  return node ? getNodePath(node) : [];
};

// --- autocompletion -------------------------------------------------------------

const completeFromSchema = (getSchema: () => SchemaNode | null) => (ctx: CompletionContext): CompletionResult | null => {
  const root = getSchema();
  if (!root) return null;
  const text = ctx.state.doc.toString();
  const location = getLocation(text, ctx.pos);
  const word = ctx.matchBefore(/"?[\w\-.:@/+]*/);
  // while typing, only pop up once something was typed (Ctrl+Space always works)
  if (!ctx.explicit && (!word || word.from === word.to)) return null;
  const from = word ? word.from : ctx.pos;
  const doc = parseLoose(text);

  if (location.isAtPropertyKey) {
    const objectPath = location.path.slice(0, -1);
    const objectSchema = schemaAt(root, doc, objectPath);
    const value = objectPath.reduce<any>((v, k) => (v == null ? v : v[k as any]), doc);
    const options: Completion[] = fieldsOf(root, objectSchema, value)
      .filter((f) => !f.present)
      .map((f) => ({
        label: `"${f.key}"`,
        apply: applyText(`"${f.key}": `),
        type: "property",
        detail: typeOf(f.schema),
        info: f.schema.description,
        boost: f.relevant ? 1 : -1,
      }));
    return options.length ? { from, options, validFor: /^"?[\w\-.:@/+]*$/ } : null;
  }

  const schema = schemaAt(root, doc, location.path);
  if (!schema) return null;
  let values: unknown[] = [];
  if (schema.enum) values = schema.enum;
  else if (typeOf(schema) === "boolean") values = [true, false];
  else if (schema.examples) values = schema.examples.filter((e) => typeof e !== "object");
  if (!values.length) return null;
  return {
    from,
    options: values.map((v) => ({
      label: JSON.stringify(v),
      apply: applyText(JSON.stringify(v)),
      type: "enum",
      detail: schema.default === v ? "default" : "",
    })),
    validFor: /^"?[\w\-.:@/+]*$/,
  };
};

// --- validation --------------------------------------------------------------------

const lintWithSchema = (getSchema: () => SchemaNode | null) => (view: EditorView): Diagnostic[] => {
  const text = view.state.doc.toString();
  const errors: ParseError[] = [];
  const tree = parseTree(text, errors, { allowTrailingComma: false });
  const diagnostics: Diagnostic[] = errors.map((e) => ({
    from: e.offset,
    to: Math.min(e.offset + Math.max(e.length, 1), text.length),
    severity: "error",
    message: `Invalid JSON: ${printParseErrorCode(e.error)}`,
  }));
  const root = getSchema();
  if (!root || !tree || errors.length) return diagnostics;
  const doc = getNodeValue(tree);

  const walk = (node: Node, schema: SchemaNode | undefined, value: unknown) => {
    if (node.type === "object") {
      const known = deref(root, schema);
      for (const prop of node.children || []) {
        const [keyNode, valueNode] = prop.children || [];
        if (!keyNode || !valueNode) continue;
        const key = keyNode.value as string;
        const child = known ? childSchema(root, known, value, key) : undefined;
        if (known?.properties && !child && known.additionalProperties !== true) {
          diagnostics.push({ from: keyNode.offset, to: keyNode.offset + keyNode.length, severity: "warning",
            message: `Unknown field "${key}" for this object` });
          continue;
        }
        if (child?.deprecated)
          diagnostics.push({ from: keyNode.offset, to: keyNode.offset + keyNode.length, severity: "info",
            message: `"${key}" is deprecated${child.description ? `: ${child.description}` : ""}` });
        walk(valueNode, child, (value as any)?.[key]);
      }
    } else if (node.type === "array") {
      const items = deref(root, schema)?.items;
      (node.children || []).forEach((item, i) =>
        walk(item, items ? deref(root, items) : undefined, (value as any)?.[i]));
    } else {
      const problem = problemsFor(deref(root, schema), getNodeValue(node));
      if (problem)
        diagnostics.push({ from: node.offset, to: node.offset + node.length, severity: "warning", message: problem });
    }
  };
  walk(tree, root, doc);
  return diagnostics;
};

// --- hover docs ------------------------------------------------------------------------

const hoverDocs = (getSchema: () => SchemaNode | null) =>
  hoverTooltip((view, pos) => {
    const root = getSchema();
    if (!root) return null;
    const text = view.state.doc.toString();
    const location = getLocation(text, pos);
    if (!location.path.length) return null;
    const schema = schemaAt(root, parseLoose(text), location.path);
    if (!schema?.description) return null;
    const tree = parseTree(text);
    const node = tree && findNodeAtLocation(tree, location.path);
    const anchor = node?.parent?.type === "property" ? node.parent.offset : pos;
    return {
      pos: anchor,
      above: true,
      create: () => {
        const dom = document.createElement("div");
        dom.className = "cm-xray-doc";
        const title = document.createElement("strong");
        title.textContent = String(location.path[location.path.length - 1]);
        const body = document.createElement("div");
        body.textContent = schema.description || "";
        dom.append(title, body);
        if (schema["x-docs"]) {
          const link = document.createElement("a");
          link.href = schema["x-docs"];
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Xray docs ↗";
          dom.append(link);
        }
        return { dom };
      },
    };
  });

export const schemaExtensions = (getSchema: () => SchemaNode | null): Extension[] => [
  json(),
  autocompletion({ override: [completeFromSchema(getSchema)], activateOnTyping: true }),
  linter(lintWithSchema(getSchema), { delay: 400 }),
  lintGutter(),
  hoverDocs(getSchema),
  EditorView.baseTheme({
    ".cm-xray-doc": { padding: "6px 8px", maxWidth: "360px", fontSize: "12px", lineHeight: 1.4 },
    ".cm-xray-doc strong": { display: "block", marginBottom: "2px" },
    ".cm-xray-doc a": { display: "inline-block", marginTop: "4px", color: "#3B81F6" },
  }),
];
