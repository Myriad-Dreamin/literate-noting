import { CodeHighlightNode, CodeNode } from "@lexical/code-core";
import { ListItemNode, ListNode } from "@lexical/list";
import { $createHeadingNode, HeadingNode, QuoteNode } from "@lexical/rich-text";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type EditorState,
  type LexicalEditor,
  type SerializedEditorState,
  type SerializedLexicalNode
} from "lexical";
import { Music, Plus, Type } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef
} from "react";
import {
  BlockAbcNode,
  InlineAbcNode,
  $createBlockAbcNode,
  $createInlineAbcNode
} from "./nodes/AbcNode";
import {
  exportMarkdownFromEditor,
  importMarkdownIntoEditor
} from "./markdown";

const defaultInlineNotation = "C D E F | G A B c";
const defaultBlockNotation = `X:1
T:New phrase
M:4/4
L:1/8
K:C
CDEF GABc | cBAG FEDC |`;
const loadEditorStateTag = "literate-noting-load";
type StoredEditorState = SerializedEditorState<SerializedLexicalNode>;

type MarkdownEditorProps = {
  cachedEditorState: StoredEditorState | null;
  loadKey: string;
  markdown: string;
  onEditorStateChange: (editorState: StoredEditorState) => void;
};

export type MarkdownEditorHandle = {
  exportMarkdown: () => string;
  getSerializedEditorState: () => StoredEditorState | null;
};

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    { cachedEditorState, loadKey, markdown, onEditorStateChange },
    ref
  ) {
  const editorRef = useRef<LexicalEditor | null>(null);
  const initialConfig = useMemo(
    () => ({
      namespace: "literate-noting",
      nodes: [
        HeadingNode,
        QuoteNode,
        CodeNode,
        CodeHighlightNode,
        ListNode,
        ListItemNode,
        TableNode,
        TableRowNode,
        TableCellNode,
        BlockAbcNode,
        InlineAbcNode
      ],
      onError(error: Error) {
        throw error;
      },
      theme: {
        code: "editor-code",
        heading: {
          h1: "editor-heading editor-heading-h1",
          h2: "editor-heading editor-heading-h2",
          h3: "editor-heading editor-heading-h3"
        },
        list: {
          checklist: "editor-list editor-check-list",
          listitem: "editor-list-item",
          listitemChecked: "editor-list-item editor-list-item-checked",
          listitemUnchecked: "editor-list-item editor-list-item-unchecked",
          nested: {
            list: "editor-list-nested",
            listitem: "editor-list-item-nested"
          },
          ol: "editor-list editor-list-ol",
          ul: "editor-list editor-list-ul"
        },
        paragraph: "editor-paragraph",
        quote: "editor-quote",
        table: "editor-table",
        tableCell: "editor-table-cell",
        tableCellHeader: "editor-table-cell-header",
        tableRow: "editor-table-row",
        tableScrollableWrapper: "editor-table-scroll",
        text: {
          bold: "editor-text-bold",
          code: "editor-text-code",
          italic: "editor-text-italic"
        }
      }
    }),
    []
  );

  useImperativeHandle(
    ref,
    () => ({
      exportMarkdown() {
        const editor = editorRef.current;
        if (!editor) {
          return markdown;
        }

        let exportedMarkdown = "";
        editor.getEditorState().read(() => {
          exportedMarkdown = exportMarkdownFromEditor();
        });

        return exportedMarkdown;
      },
      getSerializedEditorState() {
        return (
          (editorRef.current?.getEditorState().toJSON() as StoredEditorState) ??
          null
        );
      }
    }),
    [markdown]
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="editor-shell">
        <EditorToolbar />
        <div className="editor-body">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label="Markdown editor"
                className="editor-input"
                spellCheck
              />
            }
            placeholder={<div className="editor-placeholder">开始记录...</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <TablePlugin hasCellMerge={false} hasHorizontalScroll />
          <EditorReadyPlugin
            onReady={(editor) => {
              editorRef.current = editor;
            }}
          />
          <MarkdownLoadPlugin
            cachedEditorState={cachedEditorState}
            loadKey={loadKey}
            markdown={markdown}
          />
          <MarkdownChangePlugin onEditorStateChange={onEditorStateChange} />
        </div>
      </div>
    </LexicalComposer>
  );
});

function EditorToolbar() {
  const [editor] = useLexicalComposerContext();

  return (
    <div className="editor-toolbar" aria-label="编辑工具">
      <button
        className="toolbar-button toolbar-text-button"
        onClick={() => formatParagraph(editor)}
        title="正文"
        type="button"
      >
        <Type size={16} />
        正文
      </button>
      <button
        className="toolbar-button"
        onClick={() => formatHeading(editor, "h1")}
        title="一级标题"
        type="button"
      >
        H1
      </button>
      <button
        className="toolbar-button"
        onClick={() => formatHeading(editor, "h2")}
        title="二级标题"
        type="button"
      >
        H2
      </button>
      <span className="toolbar-separator" />
      <button
        className="toolbar-button"
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
        }}
        title="加粗"
        type="button"
      >
        B
      </button>
      <button
        className="toolbar-button"
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
        }}
        title="斜体"
        type="button"
      >
        I
      </button>
      <span className="toolbar-separator" />
      <button
        className="toolbar-button toolbar-text-button"
        onClick={() => insertInlineAbc(editor)}
        title="插入行内 ABC"
        type="button"
      >
        <Music size={16} />
        行内
      </button>
      <button
        className="toolbar-button toolbar-text-button"
        onClick={() => insertBlockAbc(editor)}
        title="插入行间 ABC"
        type="button"
      >
        <Plus size={16} />
        行间
      </button>
    </div>
  );
}

function MarkdownLoadPlugin({
  cachedEditorState,
  loadKey,
  markdown
}: {
  cachedEditorState: StoredEditorState | null;
  loadKey: string;
  markdown: string;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (cachedEditorState) {
      editor.setEditorState(editor.parseEditorState(cachedEditorState), {
        tag: loadEditorStateTag
      });
      return;
    }

    editor.update(
      () => {
        importMarkdownIntoEditor(markdown);
      },
      { tag: loadEditorStateTag }
    );
  }, [cachedEditorState, editor, loadKey, markdown]);

  return null;
}

function MarkdownChangePlugin({
  onEditorStateChange
}: {
  onEditorStateChange: (editorState: StoredEditorState) => void;
}) {
  return (
    <OnChangePlugin
      ignoreSelectionChange
      onChange={(editorState: EditorState, _editor, tags) => {
        if (tags.has(loadEditorStateTag)) {
          return;
        }

        onEditorStateChange(editorState.toJSON() as StoredEditorState);
      }}
    />
  );
}

function EditorReadyPlugin({
  onReady
}: {
  onReady: (editor: LexicalEditor | null) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  return null;
}

function formatParagraph(editor: LexicalEditor) {
  editor.update(() => {
    const selection = $getSelection();

    if (!$isRangeSelection(selection)) {
      return;
    }

    const paragraph = $createParagraphNode();
    const topLevelNode = selection.getNodes().at(0)?.getTopLevelElementOrThrow();

    if (!topLevelNode || !$isElementNode(topLevelNode)) {
      return;
    }

    paragraph.append(...topLevelNode.getChildren());
    topLevelNode.replace(paragraph);
    paragraph.select();
  });
}

function formatHeading(
  editor: LexicalEditor,
  tag: "h1" | "h2"
) {
  editor.update(() => {
    const selection = $getSelection();

    if (!$isRangeSelection(selection)) {
      return;
    }

    const heading = $createHeadingNode(tag);
    const topLevelNode = selection.getNodes().at(0)?.getTopLevelElementOrThrow();

    if (!topLevelNode || !$isElementNode(topLevelNode)) {
      return;
    }

    heading.append(...topLevelNode.getChildren());
    topLevelNode.replace(heading);
    heading.select();
  });
}

function insertInlineAbc(editor: LexicalEditor) {
  editor.update(() => {
    const selection = $getSelection();
    const inlineNode = $createInlineAbcNode(defaultInlineNotation);

    if ($isRangeSelection(selection)) {
      selection.insertNodes([inlineNode]);
      return;
    }

    const paragraph = $createParagraphNode();
    paragraph.append(inlineNode);
    $getRoot().append(paragraph);
  });
}

function insertBlockAbc(editor: LexicalEditor) {
  editor.update(() => {
    const selection = $getSelection();
    const blockNode = $createBlockAbcNode(defaultBlockNotation);
    const nextParagraph = $createParagraphNode();

    if ($isRangeSelection(selection)) {
      selection.insertNodes([blockNode, nextParagraph]);
      nextParagraph.select();
      return;
    }

    $getRoot().append(blockNode, nextParagraph);
    nextParagraph.select();
  });
}
