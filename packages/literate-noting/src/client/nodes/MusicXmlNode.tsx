import { Check, Pencil, X } from "lucide-react";
import {
  $applyNodeReplacement,
  $getNodeByKey,
  DecoratorNode,
  type LexicalEditor,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement
} from "react";

export type SerializedMusicXmlNode = Spread<
  {
    xml: string;
  },
  SerializedLexicalNode
>;

export class MusicXmlNode extends DecoratorNode<ReactElement> {
  __xml: string;

  static getType(): string {
    return "music-xml";
  }

  static clone(node: MusicXmlNode): MusicXmlNode {
    return new MusicXmlNode(node.__xml, node.__key);
  }

  static importJSON(serializedNode: SerializedMusicXmlNode): MusicXmlNode {
    return $createMusicXmlNode(serializedNode.xml);
  }

  constructor(xml: string, key?: NodeKey) {
    super(key);
    this.__xml = xml;
  }

  exportJSON(): SerializedMusicXmlNode {
    return {
      ...super.exportJSON(),
      xml: this.getXml()
    };
  }

  createDOM(): HTMLElement {
    const element = document.createElement("div");
    element.className = "musicxml-decorator";
    return element;
  }

  updateDOM(): false {
    return false;
  }

  getTextContent(): string {
    return this.getXml();
  }

  getXml(): string {
    return this.getLatest().__xml;
  }

  setXml(xml: string): void {
    const self = this.getWritable();
    self.__xml = xml;
  }

  decorate(editor: LexicalEditor): ReactElement {
    return (
      <MusicXmlControl
        editor={editor}
        nodeKey={this.getKey()}
        xml={this.getXml()}
      />
    );
  }
}

export function $createMusicXmlNode(xml: string): MusicXmlNode {
  return $applyNodeReplacement(new MusicXmlNode(xml));
}

export function $isMusicXmlNode(node: unknown): node is MusicXmlNode {
  return node instanceof MusicXmlNode;
}

function MusicXmlControl({
  editor,
  nodeKey,
  xml
}: {
  editor: LexicalEditor;
  nodeKey: NodeKey;
  xml: string;
}) {
  const [draft, setDraft] = useState(xml);
  const [isEditing, setIsEditing] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const normalizedXml = useMemo(() => xml.trim(), [xml]);

  useEffect(() => {
    setDraft(xml);
  }, [xml]);

  useEffect(() => {
    let cancelled = false;
    const sheet = sheetRef.current;

    if (!sheet) {
      return;
    }

    sheet.replaceChildren();
    osmdRef.current = null;

    if (!normalizedXml) {
      setRenderError("MusicXML 内容为空。");
      return;
    }

    void import("opensheetmusicdisplay")
      .then(({ OpenSheetMusicDisplay }) => {
        if (cancelled) {
          return null;
        }

        const osmd = new OpenSheetMusicDisplay(sheet, {
          autoResize: true,
          backend: "svg",
          drawCredits: false,
          drawingParameters: "compacttight",
          pageFormat: "Endless"
        });
        osmdRef.current = osmd;

        return osmd.load(normalizedXml).then(() => osmd);
      })
      .then(() => {
        const osmd = osmdRef.current;

        if (cancelled || !osmd) {
          return;
        }

        osmd.render();
        setRenderError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setRenderError(
          error instanceof Error ? error.message : "MusicXML 渲染失败。"
        );
      });

    return () => {
      cancelled = true;
      osmdRef.current?.clear();
    };
  }, [normalizedXml]);

  function commitDraft() {
    const nextXml = draft.trim();

    editor.update(() => {
      const node = $getNodeByKey(nodeKey);

      if ($isMusicXmlNode(node)) {
        node.setXml(nextXml);
      }
    });

    setIsEditing(false);
  }

  return (
    <div className="musicxml-node" contentEditable={false}>
      <div className="musicxml-node-main">
        <div ref={sheetRef} className="musicxml-sheet" />
        {renderError ? (
          <div className="musicxml-error">{renderError}</div>
        ) : null}
      </div>

      <div className="musicxml-node-actions">
        <button
          aria-label="编辑 MusicXML"
          className="icon-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setIsEditing(true)}
          title="编辑 MusicXML"
          type="button"
        >
          <Pencil size={14} />
        </button>
      </div>

      {isEditing ? (
        <div className="musicxml-editor-popover">
          <textarea
            aria-label="MusicXML source"
            className="musicxml-editor-input"
            rows={14}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="musicxml-editor-actions">
            <button
              aria-label="应用"
              className="icon-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={commitDraft}
              title="应用"
              type="button"
            >
              <Check size={15} />
            </button>
            <button
              aria-label="取消"
              className="icon-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setDraft(xml);
                setIsEditing(false);
              }}
              title="取消"
              type="button"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
