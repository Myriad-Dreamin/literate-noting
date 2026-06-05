import { $createCodeNode, $isCodeNode } from "@lexical/code-core";
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  type ListType
} from "@lexical/list";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  type HeadingTagType
} from "@lexical/rich-text";
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates
} from "@lexical/table";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
  type TextFormatType
} from "lexical";
import {
  $createBlockAbcNode,
  $createInlineAbcNode,
  $isBlockAbcNode,
  $isInlineAbcNode
} from "./nodes/AbcNode";
import {
  $createMusicXmlNode,
  $isMusicXmlNode
} from "./nodes/MusicXmlNode";

type ListLine = {
  checked?: boolean;
  content: string;
  marker: string;
  start?: number;
  type: ListType;
};

const abcFenceStartPattern = /^```abc(?:\s+note)?\s*$/i;
const musicXmlFenceStartPattern = /^```(?:music-xml|musicxml|xml-music)\s*$/i;
const codeFenceStartPattern = /^```([^\s`]*)\s*$/;
const fenceEndPattern = /^```\s*$/;
const headingPattern = /^(#{1,6})\s+(.+)$/;

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
      const [node, nextIndex] = readAbcBlock(lines, index);
      root.append(node);
      index = nextIndex;
      continue;
    }

    if (musicXmlFenceStartPattern.test(line)) {
      const [node, nextIndex] = readMusicXmlBlock(lines, index);
      root.append(node);
      index = nextIndex;
      continue;
    }

    const codeFenceMatch = line.match(codeFenceStartPattern);
    if (codeFenceMatch) {
      const [node, nextIndex] = readCodeBlock(
        lines,
        index,
        codeFenceMatch[1] || undefined
      );
      root.append(node);
      index = nextIndex;
      continue;
    }

    if (isTableStart(lines, index)) {
      const [node, nextIndex] = readTable(lines, index);
      root.append(node);
      index = nextIndex;
      continue;
    }

    if (isBlockquoteLine(line)) {
      const [node, nextIndex] = readBlockquote(lines, index);
      root.append(node);
      index = nextIndex;
      continue;
    }

    const firstListLine = parseListLine(line);
    if (firstListLine) {
      const [node, nextIndex] = readList(lines, index, firstListLine.type);
      root.append(node);
      index = nextIndex;
      continue;
    }

    const headingMatch = line.match(headingPattern);
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
      !isBlockStart(lines, index)
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
    .filter((block): block is string => block !== null && block.trim() !== "");

  return `${blocks.join("\n\n").trimEnd()}\n`;
}

function readAbcBlock(
  lines: string[],
  startIndex: number
): [LexicalNode, number] {
  const notationLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length && !fenceEndPattern.test(lines[index] ?? "")) {
    notationLines.push(lines[index] ?? "");
    index += 1;
  }

  if (index < lines.length) {
    index += 1;
  }

  return [$createBlockAbcNode(notationLines.join("\n").trim()), index];
}

function readMusicXmlBlock(
  lines: string[],
  startIndex: number
): [LexicalNode, number] {
  const xmlLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length && !fenceEndPattern.test(lines[index] ?? "")) {
    xmlLines.push(lines[index] ?? "");
    index += 1;
  }

  if (index < lines.length) {
    index += 1;
  }

  return [$createMusicXmlNode(xmlLines.join("\n").trim()), index];
}

function readCodeBlock(
  lines: string[],
  startIndex: number,
  language: string | undefined
): [LexicalNode, number] {
  const codeLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length && !fenceEndPattern.test(lines[index] ?? "")) {
    codeLines.push(lines[index] ?? "");
    index += 1;
  }

  if (index < lines.length) {
    index += 1;
  }

  const code = $createCodeNode(language);
  const content = codeLines.join("\n");
  if (content) {
    code.append($createTextNode(content));
  }

  return [code, index];
}

function readBlockquote(
  lines: string[],
  startIndex: number
): [LexicalNode, number] {
  const quote = $createQuoteNode();
  let index = startIndex;
  let isFirstLine = true;

  while (index < lines.length && isBlockquoteLine(lines[index] ?? "")) {
    if (!isFirstLine) {
      quote.append($createLineBreakNode());
    }

    appendInlineMarkdownChildren(quote, stripBlockquoteMarker(lines[index] ?? ""));
    isFirstLine = false;
    index += 1;
  }

  return [quote, index];
}

function readList(
  lines: string[],
  startIndex: number,
  listType: ListType
): [LexicalNode, number] {
  const firstListLine = parseListLine(lines[startIndex] ?? "");
  const list = $createListNode(listType, firstListLine?.start);
  let index = startIndex;

  while (index < lines.length) {
    const listLine = parseListLine(lines[index] ?? "");

    if (!listLine || listLine.type !== listType) {
      break;
    }

    const item = $createListItemNode(listLine.checked);
    if (listLine.start) {
      item.setValue(listLine.start);
    }
    appendInlineMarkdownChildren(item, listLine.content);
    list.append(item);
    index += 1;
  }

  return [list, index];
}

function readTable(lines: string[], startIndex: number): [LexicalNode, number] {
  const header = parseTableRow(lines[startIndex] ?? "") ?? [];
  const bodyRows: string[][] = [];
  let index = startIndex + 2;

  while (index < lines.length) {
    const row = parseTableRow(lines[index] ?? "");
    if (!row) {
      break;
    }

    bodyRows.push(row);
    index += 1;
  }

  const rows = [header, ...bodyRows];
  const columnCount = Math.max(...rows.map((row) => row.length));
  const table = $createTableNode();

  rows.forEach((row, rowIndex) => {
    const tableRow = $createTableRowNode();
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const headerState =
        rowIndex === 0
          ? TableCellHeaderStates.COLUMN
          : TableCellHeaderStates.NO_STATUS;
      const cell = $createTableCellNode(headerState);
      const paragraph = $createParagraphNode();
      appendInlineMarkdownChildren(paragraph, row[columnIndex] ?? "");
      cell.append(paragraph);
      tableRow.append(cell);
    }
    table.append(tableRow);
  });

  return [table, index];
}

function appendInlineMarkdownChildren(
  parent: ElementNode,
  source: string,
  inheritedFormats: TextFormatType[] = []
): void {
  let cursor = 0;

  while (cursor < source.length) {
    const abcMatch = source.slice(cursor).match(/^\{([^{}\n]+)\}/);
    if (abcMatch) {
      parent.append($createInlineAbcNode((abcMatch[1] ?? "").trim()));
      cursor += abcMatch[0].length;
      continue;
    }

    if (source[cursor] === "`") {
      const endIndex = source.indexOf("`", cursor + 1);
      if (endIndex > cursor + 1) {
        appendInlineMarkdownChildren(parent, source.slice(cursor + 1, endIndex), [
          ...inheritedFormats,
          "code"
        ]);
        cursor = endIndex + 1;
        continue;
      }
    }

    const boldMarker =
      source.startsWith("**", cursor) || source.startsWith("__", cursor)
        ? source.slice(cursor, cursor + 2)
        : null;
    if (boldMarker) {
      const endIndex = source.indexOf(boldMarker, cursor + 2);
      if (endIndex > cursor + 2) {
        appendInlineMarkdownChildren(
          parent,
          source.slice(cursor + 2, endIndex),
          [...inheritedFormats, "bold"]
        );
        cursor = endIndex + 2;
        continue;
      }
    }

    const italicMarker =
      (source[cursor] === "*" && source[cursor + 1] !== "*") ||
      (source[cursor] === "_" && source[cursor + 1] !== "_")
        ? source[cursor]
        : null;
    if (italicMarker) {
      const endIndex = source.indexOf(italicMarker, cursor + 1);
      if (endIndex > cursor + 1) {
        appendInlineMarkdownChildren(
          parent,
          source.slice(cursor + 1, endIndex),
          [...inheritedFormats, "italic"]
        );
        cursor = endIndex + 1;
        continue;
      }
    }

    const nextTokenIndex = findNextInlineToken(source, cursor + 1);
    appendFormattedText(
      parent,
      source.slice(cursor, nextTokenIndex),
      inheritedFormats
    );
    cursor = nextTokenIndex;
  }
}

function appendFormattedText(
  parent: ElementNode,
  text: string,
  formats: TextFormatType[]
): void {
  if (!text) {
    return;
  }

  const textNode = $createTextNode(text);
  for (const format of formats) {
    if (!textNode.hasFormat(format)) {
      textNode.toggleFormat(format);
    }
  }
  parent.append(textNode);
}

function serializeTopLevelNode(node: LexicalNode): string | null {
  if ($isBlockAbcNode(node)) {
    return `\`\`\`abc note\n${node.getNotation().trim()}\n\`\`\``;
  }

  if ($isMusicXmlNode(node)) {
    return `\`\`\`music-xml\n${node.getXml().trim()}\n\`\`\``;
  }

  if ($isCodeNode(node)) {
    return serializeCodeBlock(node);
  }

  if ($isQuoteNode(node)) {
    return serializeQuote(node);
  }

  if ($isListNode(node)) {
    return serializeList(node);
  }

  if ($isTableNode(node)) {
    return serializeTable(node);
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

function serializeCodeBlock(node: LexicalNode): string {
  if (!$isCodeNode(node)) {
    return "";
  }

  const content = node.getTextContent();
  const fence = chooseCodeFence(content);
  return `${fence}${node.getLanguage() ?? ""}\n${content}\n${fence}`;
}

function serializeQuote(node: ElementNode): string {
  return serializeInlineChildren(node)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function serializeList(node: LexicalNode, depth = 0): string {
  if (!$isListNode(node)) {
    return "";
  }

  let itemIndex = 0;
  const indent = "  ".repeat(depth);

  return node
    .getChildren()
    .filter($isListItemNode)
    .map((item) => {
      const prefix = listItemPrefix(node.getListType(), node.getStart(), itemIndex, item);
      itemIndex += 1;
      const content = serializeListItem(item, depth).replace(/\n/g, `\n${indent}  `);
      return `${indent}${prefix}${content}`;
    })
    .join("\n");
}

function serializeListItem(item: ElementNode, depth: number): string {
  return item
    .getChildren()
    .map((child) => {
      if ($isListNode(child)) {
        return `\n${serializeList(child, depth + 1)}`;
      }

      if ($isElementNode(child)) {
        return serializeInlineChildren(child);
      }

      if ($isTextNode(child)) {
        return serializeTextNode(child);
      }

      if ($isLineBreakNode(child)) {
        return "\n";
      }

      return child.getTextContent();
    })
    .join("");
}

function serializeTable(node: LexicalNode): string | null {
  if (!$isTableNode(node)) {
    return null;
  }

  const rows = node
    .getChildren()
    .filter($isTableRowNode)
    .map((row) =>
      row
        .getChildren()
        .filter($isTableCellNode)
        .map((cell) => serializeTableCell(cell))
    );

  if (rows.length === 0) {
    return null;
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? "")
  );
  const separator = Array.from({ length: columnCount }, () => "---");

  const header = normalizedRows[0] ?? Array.from({ length: columnCount }, () => "");

  return [header, separator, ...normalizedRows.slice(1)]
    .map((row) => markdownTableRow(row))
    .join("\n");
}

function serializeTableCell(cell: ElementNode): string {
  return cell
    .getChildren()
    .map((child) => {
      if ($isElementNode(child)) {
        return serializeInlineChildren(child);
      }

      if ($isTextNode(child)) {
        return serializeTextNode(child);
      }

      if ($isLineBreakNode(child)) {
        return "<br>";
      }

      return child.getTextContent();
    })
    .join(" ")
    .replace(/\n/g, "<br>")
    .trim();
}

function serializeInlineChildren(node: ElementNode): string {
  return node
    .getChildren()
    .map((child) => {
      if ($isInlineAbcNode(child)) {
        return `{${child.getNotation().trim()}}`;
      }

      if ($isTextNode(child)) {
        return serializeTextNode(child);
      }

      if ($isLineBreakNode(child)) {
        return "\n";
      }

      if ($isElementNode(child)) {
        return serializeInlineChildren(child);
      }

      return child.getTextContent();
    })
    .join("");
}

function serializeTextNode(node: ReturnType<typeof $createTextNode>): string {
  let text = node.getTextContent();

  if (node.hasFormat("code")) {
    text = wrapInlineCode(text);
  }

  if (node.hasFormat("bold") && node.hasFormat("italic")) {
    return `***${text}***`;
  }

  if (node.hasFormat("bold")) {
    return `**${text}**`;
  }

  if (node.hasFormat("italic")) {
    return `*${text}*`;
  }

  return text;
}

function listItemPrefix(
  listType: ListType,
  start: number,
  index: number,
  item: ElementNode
): string {
  if (listType === "number") {
    return `${start + index}. `;
  }

  if (listType === "check" && $isListItemNode(item)) {
    return `- [${item.getChecked() ? "x" : " "}] `;
  }

  return "- ";
}

function parseListLine(line: string): ListLine | null {
  const checkMatch = line.match(/^\s*([-*+])\s+\[([ xX])\]\s+(.*)$/);
  if (checkMatch) {
    return {
      checked: checkMatch[2]?.toLowerCase() === "x",
      content: checkMatch[3] ?? "",
      marker: checkMatch[1] ?? "-",
      type: "check"
    };
  }

  const unorderedMatch = line.match(/^\s*([-*+])\s+(.*)$/);
  if (unorderedMatch) {
    return {
      content: unorderedMatch[2] ?? "",
      marker: unorderedMatch[1] ?? "-",
      type: "bullet"
    };
  }

  const orderedMatch = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
  if (orderedMatch) {
    return {
      content: orderedMatch[2] ?? "",
      marker: orderedMatch[1] ?? "1",
      start: Number.parseInt(orderedMatch[1] ?? "1", 10),
      type: "number"
    };
  }

  return null;
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  return (
    abcFenceStartPattern.test(line) ||
    musicXmlFenceStartPattern.test(line) ||
    codeFenceStartPattern.test(line) ||
    headingPattern.test(line) ||
    isBlockquoteLine(line) ||
    parseListLine(line) !== null ||
    isTableStart(lines, index)
  );
}

function isBlockquoteLine(line: string): boolean {
  return /^\s*>\s?/.test(line);
}

function stripBlockquoteMarker(line: string): string {
  return line.replace(/^\s*>\s?/, "");
}

function isTableStart(lines: string[], index: number): boolean {
  const header = parseTableRow(lines[index] ?? "");
  const separator = parseTableRow(lines[index + 1] ?? "");

  return (
    header !== null &&
    header.length >= 2 &&
    separator !== null &&
    separator.length >= 2 &&
    separator.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
  );
}

function parseTableRow(line: string): string[] | null {
  const trimmedLine = line.trim();
  if (!trimmedLine.includes("|")) {
    return null;
  }

  const cells: string[] = [];
  let current = "";
  let escaped = false;
  let inInlineAbc = false;
  let inInlineCode = false;

  for (const character of trimmedLine) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === "`") {
      inInlineCode = !inInlineCode;
      current += character;
      continue;
    }

    if (!inInlineCode && character === "{") {
      inInlineAbc = true;
      current += character;
      continue;
    }

    if (!inInlineCode && character === "}") {
      inInlineAbc = false;
      current += character;
      continue;
    }

    if (!inInlineCode && !inInlineAbc && character === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());

  if (trimmedLine.startsWith("|")) {
    cells.shift();
  }

  if (trimmedLine.endsWith("|")) {
    cells.pop();
  }

  return cells.length >= 2 ? cells : null;
}

function markdownTableRow(cells: string[]): string {
  return `| ${cells.map(escapeTableCell).join(" | ")} |`;
}

function escapeTableCell(cell: string): string {
  return cell.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function findNextInlineToken(source: string, startIndex: number): number {
  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{" || character === "`" || character === "*" || character === "_") {
      return index;
    }
  }

  return source.length;
}

function chooseCodeFence(content: string): string {
  const backtickRuns = content.match(/`{3,}/g);
  if (!backtickRuns) {
    return "```";
  }

  const maxRunLength = Math.max(...backtickRuns.map((run) => run.length));
  return "`".repeat(maxRunLength + 1);
}

function wrapInlineCode(text: string): string {
  const fence = text.includes("`") ? "``" : "`";
  return `${fence}${text}${fence}`;
}

function headingLevelFromTag(tag: HeadingTagType): number {
  return Number.parseInt(tag.replace("h", ""), 10);
}
