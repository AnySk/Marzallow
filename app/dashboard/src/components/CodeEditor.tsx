import { Box, BoxProps, useColorMode } from "@chakra-ui/react";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { FC, useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange?: (text: string) => void;
  language: "json" | "yaml" | "html";
  readOnly?: boolean;
} & Omit<BoxProps, "onChange">;

const LANG = { json, yaml, html };

/** A plain CodeMirror editor (the Xray editor with schema help is CoreConfigEditor). */
export const CodeEditor: FC<Props> = ({ value, onChange, language, readOnly, ...props }) => {
  const { colorMode } = useColorMode();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const state = EditorState.create({
      doc: view.current?.state.doc.toString() ?? value,
      extensions: [
        basicSetup,
        LANG[language](),
        ...(colorMode === "dark" ? [oneDark] : []),
        EditorState.readOnly.of(!!readOnly),
        EditorView.lineWrapping,
        EditorView.theme({ "&": { height: "100%", fontSize: "13px" }, ".cm-scroller": { overflow: "auto" } }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
        }),
      ],
    });
    view.current?.destroy();
    view.current = new EditorView({ state, parent: host.current! });
    // lets browser tests (and devtools) reach the editor: document.querySelector(...).__view
    (host.current as any).__view = view.current;
    return () => {
      view.current?.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorMode, language, readOnly]);

  useEffect(() => {
    const current = view.current?.state.doc.toString();
    if (view.current && current !== value)
      view.current.dispatch({ changes: { from: 0, to: current!.length, insert: value } });
  }, [value]);

  return (
    <Box
      ref={host}
      borderWidth="1px"
      borderColor="border-strong"
      borderRadius="md"
      overflow="hidden"
      sx={{ ".cm-editor": { height: "100%" }, ".cm-gutters": { borderRight: "1px solid var(--chakra-colors-border)" } }}
      {...props}
    />
  );
};

export default CodeEditor;
