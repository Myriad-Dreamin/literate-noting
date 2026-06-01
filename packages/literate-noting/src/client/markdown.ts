import {
  $createHeadingNode,
  $isHeadingNode,
  type HeadingTagType
} from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isParagraphNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode
} from "lexical";
import {
  $createBlockAbcNode,
  $createInlineAbcNode,
  $isBlockAbcNode,
  $isInlineAbcNode
} from "./nodes/AbcNode";

const inlineAbcPattern = /\{([^{}\n]+)\}/g;
const abcFenceStartPattern = /^```abc(?:\s+note)?\s*$/i;
const fenceEndPattern = /^```\s*$/;

export function importMarkdownIntoEditor(markdown: string): void {
  const root = $getRoot();
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");

  root.clear();

  for (let index = 0; index < lines.length; ) {
    const line = lines[index] ?? "";

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    if (abcFenceStartPattern.test(line)) {
      const notationLines: string[] = [];
      index += 1;

      while (index < lines.length && !fenceEndPattern.test(lines[index] ?? "")) {
        notationLines.push(lines[index] ?? "");
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      root.append($createBlockAbcNode(notationLines.join("\n").trim()));
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      const heading = $createHeadingNode(`h${level}` as HeadingTagType);
      appendInlineMarkdownChildren(heading, headingMatch[2] ?? "");
      root.append(heading);
      index += 1;
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;

    while (
      index < lines.length &&
      lines[index]?.trim() !== "" &&
      !abcFenceStartPattern.test(lines[index] ?? "") &&
      !/^(#{1,6})\s+(.+)$/.test(lines[index] ?? "")
    ) {
      paragraphLines.push((lines[index] ?? "").trim());
      index += 1;
    }

    const paragraph = $createParagraphNode();
    appendInlineMarkdownChildren(paragraph, paragraphLines.join(" "));
    root.append(paragraph);
  }

  if (root.getChildrenSize() === 0) {
    root.append($createParagraphNode());
  }
}

export function exportMarkdownFromEditor(): string {
  const blocks = $getRoot()
    .getChildren()
    .map((node) => serializeTopLevelNode(node))
    .filter((block) => block !== null);

  return `${blocks.join("\n\n").trimEnd()}\n`;
}

function appendInlineMarkdownChildren(parent: ElementNode, source: string): void {
  let cursor = 0;

  for (const match of source.matchAll(inlineAbcPattern)) {
    const matchIndex = match.index ?? 0;
    const leadingText = source.slice(cursor, matchIndex);

    if (leadingText) {
      parent.append($createTextNode(leadingText));
    }

    parent.append($createInlineAbcNode((match[1] ?? "").trim()));
    cursor = matchIndex + match[0].length;
  }

  const trailingText = source.slice(cursor);
  if (trailingText) {
    parent.append($createTextNode(trailingText));
  }
}

function serializeTopLevelNode(node: LexicalNode): string | null {
  if ($isBlockAbcNode(node)) {
    return `\`\`\`abc note\n${node.getNotation().trim()}\n\`\`\``;
  }

  if ($isParagraphNode(node)) {
    return serializeInlineChildren(node);
  }

  if ($isHeadingNode(node)) {
    const level = headingLevelFromTag(node.getTag());
    return `${"#".repeat(level)} ${serializeInlineChildren(node)}`;
  }

  return node.getTextContent();
}

function serializeInlineChildren(node: ElementNode): string {
  return node
    .getChildren()
    .map((child) => {
      if ($isInlineAbcNode(child)) {
        return `{${child.getNotation().trim()}}`;
      }

      if ($isTextNode(child)) {
        return child.getTextContent();
      }

      if ($isElementNode(child)) {
        return serializeInlineChildren(child);
      }

      return child.getTextContent();
    })
    .join("");
}

function headingLevelFromTag(tag: HeadingTagType): number {
  return Number.parseInt(tag.replace("h", ""), 10);
}
