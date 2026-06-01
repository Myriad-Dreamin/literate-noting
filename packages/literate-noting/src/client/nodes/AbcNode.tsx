import { Check, Pencil, Play, Square, X } from "lucide-react";
import {
  $applyNodeReplacement,
  $getNodeByKey,
  DecoratorNode,
  type LexicalEditor,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement
} from "react";
import abcjs from "abcjs";
import { useAppSettings } from "../settings";

export type SerializedInlineAbcNode = Spread<
  {
    notation: string;
  },
  SerializedLexicalNode
>;

export type SerializedBlockAbcNode = Spread<
  {
    notation: string;
  },
  SerializedLexicalNode
>;

export class InlineAbcNode extends DecoratorNode<ReactElement> {
  __notation: string;

  static getType(): string {
    return "inline-abc";
  }

  static clone(node: InlineAbcNode): InlineAbcNode {
    return new InlineAbcNode(node.__notation, node.__key);
  }

  static importJSON(serializedNode: SerializedInlineAbcNode): InlineAbcNode {
    return $createInlineAbcNode(serializedNode.notation);
  }

  constructor(notation: string, key?: NodeKey) {
    super(key);
    this.__notation = notation;
  }

  exportJSON(): SerializedInlineAbcNode {
    return {
      ...super.exportJSON(),
      notation: this.getNotation()
    };
  }

  createDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "abc-decorator abc-decorator-inline";
    return element;
  }

  updateDOM(): false {
    return false;
  }

  isInline(): true {
    return true;
  }

  getTextContent(): string {
    return `{${this.getNotation()}}`;
  }

  getNotation(): string {
    return this.getLatest().__notation;
  }

  setNotation(notation: string): void {
    const self = this.getWritable();
    self.__notation = notation;
  }

  decorate(editor: LexicalEditor): ReactElement {
    return (
      <AbcNotationControl
        block={false}
        editor={editor}
        nodeKey={this.getKey()}
        notation={this.getNotation()}
      />
    );
  }
}

export class BlockAbcNode extends DecoratorNode<ReactElement> {
  __notation: string;

  static getType(): string {
    return "block-abc";
  }

  static clone(node: BlockAbcNode): BlockAbcNode {
    return new BlockAbcNode(node.__notation, node.__key);
  }

  static importJSON(serializedNode: SerializedBlockAbcNode): BlockAbcNode {
    return $createBlockAbcNode(serializedNode.notation);
  }

  constructor(notation: string, key?: NodeKey) {
    super(key);
    this.__notation = notation;
  }

  exportJSON(): SerializedBlockAbcNode {
    return {
      ...super.exportJSON(),
      notation: this.getNotation()
    };
  }

  createDOM(): HTMLElement {
    const element = document.createElement("div");
    element.className = "abc-decorator abc-decorator-block";
    return element;
  }

  updateDOM(): false {
    return false;
  }

  getTextContent(): string {
    return this.getNotation();
  }

  getNotation(): string {
    return this.getLatest().__notation;
  }

  setNotation(notation: string): void {
    const self = this.getWritable();
    self.__notation = notation;
  }

  decorate(editor: LexicalEditor): ReactElement {
    return (
      <AbcNotationControl
        block
        editor={editor}
        nodeKey={this.getKey()}
        notation={this.getNotation()}
      />
    );
  }
}

export function $createInlineAbcNode(notation: string): InlineAbcNode {
  return $applyNodeReplacement(new InlineAbcNode(notation));
}

export function $createBlockAbcNode(notation: string): BlockAbcNode {
  return $applyNodeReplacement(new BlockAbcNode(notation));
}

export function $isInlineAbcNode(node: unknown): node is InlineAbcNode {
  return node instanceof InlineAbcNode;
}

export function $isBlockAbcNode(node: unknown): node is BlockAbcNode {
  return node instanceof BlockAbcNode;
}

function AbcNotationControl({
  block,
  editor,
  nodeKey,
  notation
}: {
  block: boolean;
  editor: LexicalEditor;
  nodeKey: NodeKey;
  notation: string;
}) {
  const settings = useAppSettings();
  const [draft, setDraft] = useState(notation);
  const [isEditing, setIsEditing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const visualObjectRef = useRef<any>(null);
  const synthRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const normalizedNotation = useMemo(() => normalizeAbcNotation(notation), [notation]);

  useEffect(() => {
    setDraft(notation);
  }, [notation]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) {
      return;
    }

    sheet.replaceChildren();

    try {
      const visualObjects = abcjs.renderAbc(sheet, normalizedNotation, {
        add_classes: true,
        responsive: "resize",
        scale: block ? 1 : 0.72,
        staffwidth: block ? 700 : 250
      });

      visualObjectRef.current = visualObjects[0] ?? null;
      setRenderError(null);
    } catch (error) {
      visualObjectRef.current = null;
      setRenderError(error instanceof Error ? error.message : "ABC 渲染失败。");
    }
  }, [block, normalizedNotation]);

  useEffect(() => {
    return () => {
      stopPlayback(synthRef.current);
    };
  }, []);

  function commitDraft() {
    const nextNotation = draft.trim();

    editor.update(() => {
      const node = $getNodeByKey(nodeKey);

      if (block && $isBlockAbcNode(node)) {
        node.setNotation(nextNotation);
      }

      if (!block && $isInlineAbcNode(node)) {
        node.setNotation(nextNotation);
      }
    });

    setIsEditing(false);
  }

  async function playNotation() {
    const visualObject = visualObjectRef.current;

    if (!visualObject || !abcjs.synth?.CreateSynth) {
      return;
    }

    try {
      stopPlayback(synthRef.current);

      const AudioContextConstructor =
        window.AudioContext ?? (window as any).webkitAudioContext;

      if (!AudioContextConstructor) {
        setRenderError("当前浏览器不支持音频播放。");
        return;
      }

      const audioContext =
        audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = audioContext;

      await audioContext.resume();

      const synth = new abcjs.synth.CreateSynth();
      synthRef.current = synth;
      setIsPlaying(true);
      await synth.init({
        audioContext,
        visualObj: visualObject,
        options: {
          program: settings.pianoProgram,
          soundFontUrl: settings.soundFontUrl,
          soundFontVolumeMultiplier: settings.soundFontVolumeMultiplier
        }
      });
      await synth.prime();
      await synth.start();
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : "ABC 播放失败。");
    } finally {
      setIsPlaying(false);
    }
  }

  function stopNotation() {
    stopPlayback(synthRef.current);
    setIsPlaying(false);
  }

  return (
    <span
      className={block ? "abc-node abc-node-block" : "abc-node abc-node-inline"}
      contentEditable={false}
    >
      <span className="abc-node-main">
        {block ? (
          <span ref={sheetRef} className="abc-sheet" />
        ) : (
          <>
            <span
              ref={sheetRef}
              aria-hidden="true"
              className="abc-sheet abc-sheet-audio-source"
            />
            <InlineNoteStrip notation={notation} />
          </>
        )}
        {renderError ? <span className="abc-error">{renderError}</span> : null}
      </span>

      <span className="abc-node-actions">
        <button
          aria-label="播放"
          className="icon-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void playNotation()}
          title="播放"
          type="button"
        >
          <Play size={15} />
        </button>
        <button
          aria-label="停止"
          className="icon-button"
          disabled={!isPlaying}
          onMouseDown={(event) => event.preventDefault()}
          onClick={stopNotation}
          title="停止"
          type="button"
        >
          <Square size={14} />
        </button>
        <button
          aria-label="编辑 ABC"
          className="icon-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setIsEditing(true)}
          title="编辑 ABC"
          type="button"
        >
          <Pencil size={14} />
        </button>
      </span>

      {isEditing ? (
        <span className="abc-editor-popover">
          <textarea
            aria-label="ABC notation"
            className="abc-editor-input"
            rows={block ? 8 : 3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <span className="abc-editor-actions">
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
                setDraft(notation);
                setIsEditing(false);
              }}
              title="取消"
              type="button"
            >
              <X size={15} />
            </button>
          </span>
        </span>
      ) : null}
    </span>
  );
}

type InlineNoteToken = {
  accidental: string;
  glyph: string;
  id: string;
  offset: number;
};

function InlineNoteStrip({ notation }: { notation: string }) {
  const notes = useMemo(() => parseInlineNoteTokens(notation), [notation]);

  return (
    <span className="abc-inline-note-strip" aria-label={notation}>
      {notes.length > 0 ? (
        notes.map((note) => (
          <span
            className="abc-inline-note-wrap"
            key={note.id}
            style={{ "--note-offset": `${note.offset}px` } as CSSProperties}
          >
            {note.accidental ? (
              <span className="abc-inline-accidental">{note.accidental}</span>
            ) : null}
            <span className="abc-inline-note">{note.glyph}</span>
          </span>
        ))
      ) : (
        <span className="abc-inline-note-wrap">
          <span className="abc-inline-note">♪</span>
        </span>
      )}
    </span>
  );
}

function parseInlineNoteTokens(notation: string): InlineNoteToken[] {
  const musicSource = notation
    .split("\n")
    .filter((line) => !/^\s*(?:[A-Za-z]:|%%|%)/.test(line))
    .join(" ");
  const tokenPattern = /([_=^]*)([A-Ga-gzZ])([,']*)(\d+\/?\d*|\/\d*|\/+)?/g;
  const notes: InlineNoteToken[] = [];

  for (const match of musicSource.matchAll(tokenPattern)) {
    const noteName = match[2] ?? "";
    const duration = match[4] ?? "";

    notes.push({
      accidental: accidentalGlyph(match[1] ?? ""),
      glyph: noteGlyph(noteName, duration),
      id: `${match.index ?? notes.length}-${match[0]}`,
      offset: noteOffset(noteName, match[3] ?? "")
    });
  }

  return notes.slice(0, 48);
}

function accidentalGlyph(accidental: string): string {
  if (accidental.includes("^")) {
    return accidental.length > 1 ? "𝄪" : "♯";
  }

  if (accidental.includes("_")) {
    return accidental.length > 1 ? "𝄫" : "♭";
  }

  if (accidental.includes("=")) {
    return "♮";
  }

  return "";
}

function noteGlyph(noteName: string, duration: string): string {
  if (/z/i.test(noteName)) {
    return "𝄽";
  }

  if (duration.includes("/")) {
    return "♪";
  }

  const durationNumber = Number.parseInt(duration, 10);
  if (Number.isFinite(durationNumber) && durationNumber > 1) {
    return "𝅗𝅥";
  }

  return "♩";
}

function noteOffset(noteName: string, octaveMarks: string): number {
  if (/z/i.test(noteName)) {
    return 0;
  }

  const pitchIndex: Record<string, number> = {
    C: 6,
    D: 5,
    E: 4,
    F: 3,
    G: 2,
    A: 1,
    B: 0,
    c: -1,
    d: -2,
    e: -3,
    f: -4,
    g: -5,
    a: -6,
    b: -7
  };
  const octaveOffset =
    [...octaveMarks].reduce((total, mark) => {
      if (mark === "'") {
        return total - 7;
      }

      if (mark === ",") {
        return total + 7;
      }

      return total;
    }, 0) * 2;
  const baseOffset = pitchIndex[noteName] ?? 0;

  return Math.max(Math.min((baseOffset + octaveOffset) * 1.35, 9), -9);
}

function normalizeAbcNotation(notation: string): string {
  const trimmedNotation = notation.trim();

  if (/^K:/im.test(trimmedNotation)) {
    return trimmedNotation;
  }

  return `X:1
M:4/4
L:1/8
K:C
${trimmedNotation}`;
}

function stopPlayback(synth: any): void {
  if (synth && typeof synth.stop === "function") {
    synth.stop();
  }
}
