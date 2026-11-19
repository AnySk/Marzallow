import { Box, Flex, useColorMode } from "@chakra-ui/react";
import { EditorSelection, EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { applyEdits, findNodeAtLocation, modify, parse, ParseError, parseTree } from "jsonc-parser";
import { FC, useCallback, useEffect, useRef, useState } from "react";
import { enclosingContainerPath, schemaExtensions } from "./extensions";
import { FieldsPanel } from "./FieldsPanel";
import { JsonPath, SchemaNode } from "./schema";

type Props = {
  value: string;
  onChange: (text: string) => void;
  height?: string; // e.g. full screen
};

const parseStrict = (text: string) => {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: false });
  return errors.length ? undefined : value;
};

/**
 * Xray config editor: JSON text with schema-driven completion, validation and
 * hover docs, plus a side panel listing the fields of the object under the
 * cursor with pickers for their allowed values. Panel edits are applied to the
 * text, preserving the rest of the formatting.
 */
export const CoreConfigEditor: FC<Props> = ({ value, onChange, height }) => {
  const { colorMode } = useColorMode();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const schemaRef = useRef<SchemaNode | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [schema, setSchema] = useState<SchemaNode | null>(null);
  const [text, setText] = useState(value);
  const [path, setPath] = useState<JsonPath | null>([]);

  useEffect(() => {
    import("./xray-schema.json").then((m) => {
      schemaRef.current = (m.default || m) as SchemaNode;
      setSchema(schemaRef.current);
    });
  }, []);

  // create the editor (re-created when the color mode changes)
  useEffect(() => {
    const state = EditorState.create({
      doc: view.current?.state.doc.toString() ?? value,
      extensions: [
        basicSetup,
        ...schemaExtensions(() => schemaRef.current),
        ...(colorMode === "dark" ? [oneDark] : []),
        EditorView.theme({ "&": { height: "100%", fontSize: "13px" }, ".cm-scroller": { overflow: "auto" } }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const next = update.state.doc.toString();
            setText(next);
            onChangeRef.current(next);
          }
          if (update.docChanged || update.selectionSet) {
            const doc = update.state.doc.toString();
            setPath(enclosingContainerPath(doc, update.state.selection.main.head));
          }
        }),
      ],
    });
    view.current?.destroy();
    view.current = new EditorView({ state, parent: host.current! });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorMode]);

  // external value changes (config loaded / reset)
  useEffect(() => {
    const current = view.current?.state.doc.toString();
    if (view.current && current !== value) {
      view.current.dispatch({ changes: { from: 0, to: current!.length, insert: value } });
    }
  }, [value]);

  const onEdit = useCallback((target: JsonPath, newValue: unknown) => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc.toString();
    const indent = /\n( +)"/.exec(doc)?.[1].length || 2;
    const edits = modify(doc, target, newValue, {
      formattingOptions: { insertSpaces: true, tabSize: indent, eol: "\n" },
    });
    if (!edits.length) return;
    const updated = applyEdits(doc, edits);
    v.dispatch({
      changes: edits.map((e) => ({ from: e.offset, to: e.offset + e.length, insert: e.content })),
    });
    // keep the panel on the same object
    const tree = parseTree(updated);
    const parent = target.slice(0, -1);
    const node = tree && findNodeAtLocation(tree, parent);
    if (node) v.dispatch({ selection: EditorSelection.cursor(Math.min(node.offset + 1, updated.length)) });
  }, []);

  const onNavigate = useCallback((target: JsonPath) => {
    const v = view.current;
    if (!v) return;
    const tree = parseTree(v.state.doc.toString());
    const node = target.length ? tree && findNodeAtLocation(tree, target) : tree;
    if (!node) return;
    v.dispatch({ selection: EditorSelection.cursor(node.offset + 1), scrollIntoView: true });
    v.focus();
  }, []);

  return (
    <Flex direction={{ base: "column", lg: "row" }} gap={3} h={height || { base: "auto", lg: "60vh" }}>
      <Box
        ref={host}
        flex={1}
        minH={{ base: "50vh", lg: 0 }}
        h={{ base: "50vh", lg: "full" }}
        border="1px solid"
        borderColor="gray.300"
        _dark={{ borderColor: "gray.500" }}
        borderRadius={5}
        overflow="hidden"
        data-testid="core-config-editor"
      />
      <Box
        w={{ base: "full", lg: "320px" }}
        flexShrink={0}
        maxH={{ base: "50vh", lg: "full" }}
        overflowY="auto"
        border="1px solid"
        borderColor="gray.200"
        _dark={{ borderColor: "gray.600" }}
        borderRadius={5}
        p={3}
      >
        <FieldsPanel schema={schema} doc={parseStrict(text)} path={path} onEdit={onEdit} onNavigate={onNavigate} />
      </Box>
    </Flex>
  );
};

export default CoreConfigEditor;
