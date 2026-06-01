import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type DocumentSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

type MarkdownDocument = DocumentSummary & {
  markdown: string;
};

type WorkspaceInfo = {
  backendAvailable: boolean;
  path: string;
  configPath: string;
  defaultPath: string;
};

type FolderSuggestion = {
  name: string;
  path: string;
};

type PianoToneId =
  | "acoustic_grand_piano"
  | "bright_acoustic_piano"
  | "electric_grand_piano"
  | "honkytonk_piano"
  | "electric_piano_1"
  | "electric_piano_2"
  | "harpsichord"
  | "clavinet";

type AppSettings = {
  pianoTone: PianoToneId;
  pianoProgram: number;
  soundFontUrl: string;
  soundFontVolumeMultiplier: number;
  documentsRoot: string;
};

type PianoToneOption = {
  id: PianoToneId;
  program: number;
};

const app = new Hono();

const serverRoot = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(serverRoot, "../..");
const staticRoot =
  process.env.LITERATE_NOTING_STATIC_DIR ?? path.join(packageRoot, "dist/client");
const defaultDocumentsRoot = path.resolve(
  process.env.LITERATE_NOTING_DOCUMENTS_DIR ??
    path.join(packageRoot, "documents")
);
const configRoot = resolveConfigRoot();
const settingsPath = path.join(configRoot, "settings.json");
const port = Number.parseInt(process.env.LITERATE_NOTING_PORT ?? "8787", 10);
const documentIdPattern = /^[a-z0-9][a-z0-9_-]*$/i;
const pianoToneOptions: PianoToneOption[] = [
  { id: "acoustic_grand_piano", program: 0 },
  { id: "bright_acoustic_piano", program: 1 },
  { id: "electric_grand_piano", program: 2 },
  { id: "honkytonk_piano", program: 3 },
  { id: "electric_piano_1", program: 4 },
  { id: "electric_piano_2", program: 5 },
  { id: "harpsichord", program: 6 },
  { id: "clavinet", program: 7 }
];
const defaultPianoToneOption: PianoToneOption = {
  id: "acoustic_grand_piano",
  program: 0
};
const defaultSettings: AppSettings = {
  pianoTone: defaultPianoToneOption.id,
  pianoProgram: defaultPianoToneOption.program,
  soundFontUrl: "https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/",
  soundFontVolumeMultiplier: 3,
  documentsRoot: defaultDocumentsRoot
};

app.get("/api/health", (context) => {
  return context.json({
    ok: true,
    service: "literate-noting"
  });
});

app.get("/api/workspace", async (context) => {
  return context.json({
    workspace: await readWorkspace()
  });
});

app.put("/api/workspace", async (context) => {
  const body = await context.req
    .json<{ path?: unknown }>()
    .catch(() => null);

  if (!body || typeof body.path !== "string" || !body.path.trim()) {
    return context.json({ error: "Expected JSON body with a folder path." }, 400);
  }

  const documentsRoot = resolveUserPath(body.path);
  const folderStat = await stat(documentsRoot).catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  });

  if (!folderStat) {
    return context.json({ error: "Folder not found." }, 404);
  }

  if (!folderStat.isDirectory()) {
    return context.json({ error: "Path is not a folder." }, 400);
  }

  const settings = normalizeSettings({
    ...(await readSettings()),
    documentsRoot
  });
  await writeSettings(settings);

  return context.json({
    workspace: toWorkspaceInfo(settings.documentsRoot)
  });
});

app.get("/api/folders/suggest", async (context) => {
  const query = context.req.query("query") ?? "";

  return context.json({
    suggestions: await suggestFolders(query)
  });
});

app.get("/api/documents", async (context) => {
  const documentsRoot = await readDocumentsRoot();
  await ensureDocumentsRoot(documentsRoot);

  const files = await readdir(documentsRoot);
  const documents = await Promise.all(
    files
      .filter((file) => file.endsWith(".md"))
      .map(async (file): Promise<DocumentSummary> => {
        const id = file.slice(0, -3);
        const filePath = path.join(documentsRoot, file);
        const [markdown, fileStat] = await Promise.all([
          readFile(filePath, "utf8"),
          stat(filePath)
        ]);

        return {
          id,
          title: readTitle(markdown) ?? id,
          updatedAt: fileStat.mtime.toISOString()
        };
      })
  );

  documents.sort((left: DocumentSummary, right: DocumentSummary) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
  return context.json({ documents });
});

app.post("/api/documents", async (context) => {
  const body = await context.req
    .json<{ id?: unknown; markdown?: unknown; title?: unknown }>()
    .catch(() => null);
  const title =
    body && typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Untitled";
  const requestedId =
    body && typeof body.id === "string" ? sanitizeDocumentId(body.id) : null;
  const documentsRoot = await readDocumentsRoot();
  const documentId = await nextAvailableDocumentId(
    documentsRoot,
    requestedId ?? slugifyDocumentTitle(title)
  );
  const markdown =
    body && typeof body.markdown === "string"
      ? body.markdown
      : `# ${title}\n\n`;
  const filePath = toDocumentPath(documentId, documentsRoot);

  if (!filePath) {
    return context.json({ error: "Invalid document id." }, 400);
  }

  await ensureDocumentsRoot(documentsRoot);
  await writeFile(filePath, markdown, "utf8");

  const fileStat = await stat(filePath);
  const document: MarkdownDocument = {
    id: documentId,
    title: readTitle(markdown) ?? title,
    markdown,
    updatedAt: fileStat.mtime.toISOString()
  };

  return context.json({ document }, 201);
});

app.get("/api/settings", async (context) => {
  return context.json({
    settings: await readSettings(),
    configPath: settingsPath
  });
});

app.put("/api/settings", async (context) => {
  const body = await context.req
    .json<{ settings?: unknown }>()
    .catch(() => null);

  if (!body || typeof body.settings !== "object" || body.settings === null) {
    return context.json({ error: "Expected JSON body with settings." }, 400);
  }

  const settings = normalizeSettings({
    ...(await readSettings()),
    ...(body.settings as Record<string, unknown>)
  });
  await writeSettings(settings);

  return context.json({ settings, configPath: settingsPath });
});

app.get("/api/documents/:id", async (context) => {
  const documentId = context.req.param("id");
  const filePath = toDocumentPath(documentId, await readDocumentsRoot());

  if (!filePath) {
    return context.json({ error: "Invalid document id." }, 400);
  }

  try {
    const [markdown, fileStat] = await Promise.all([
      readFile(filePath, "utf8"),
      stat(filePath)
    ]);
    const document: MarkdownDocument = {
      id: documentId,
      title: readTitle(markdown) ?? documentId,
      markdown,
      updatedAt: fileStat.mtime.toISOString()
    };

    return context.json({ document });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return context.json({ error: "Document not found." }, 404);
    }

    throw error;
  }
});

app.put("/api/documents/:id", async (context) => {
  const documentId = context.req.param("id");
  const documentsRoot = await readDocumentsRoot();
  const filePath = toDocumentPath(documentId, documentsRoot);

  if (!filePath) {
    return context.json({ error: "Invalid document id." }, 400);
  }

  const body = await context.req
    .json<{ markdown?: unknown }>()
    .catch(() => null);

  if (!body || typeof body.markdown !== "string") {
    return context.json({ error: "Expected JSON body with a markdown string." }, 400);
  }

  await ensureDocumentsRoot(documentsRoot);
  await writeFile(filePath, body.markdown, "utf8");

  const fileStat = await stat(filePath);
  const document: MarkdownDocument = {
    id: documentId,
    title: readTitle(body.markdown) ?? documentId,
    markdown: body.markdown,
    updatedAt: fileStat.mtime.toISOString()
  };

  return context.json({ document });
});

app.delete("/api/documents/:id", async (context) => {
  const documentId = context.req.param("id");
  const filePath = toDocumentPath(documentId, await readDocumentsRoot());

  if (!filePath) {
    return context.json({ error: "Invalid document id." }, 400);
  }

  try {
    await unlink(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return context.json({ error: "Document not found." }, 404);
    }

    throw error;
  }

  return context.json({ deletedDocumentId: documentId });
});

app.use(
  "/assets/*",
  serveStatic({
    root: staticRoot
  })
);

app.use(
  "/favicon.svg",
  serveStatic({
    root: staticRoot
  })
);

app.get("/", async (context) => {
  return context.html(await readIndexHtml());
});

app.get("*", async (context) => {
  if (context.req.path.startsWith("/api/")) {
    return context.notFound();
  }

  return context.html(await readIndexHtml());
});

async function ensureDocumentsRoot(documentsRoot: string): Promise<void> {
  await mkdir(documentsRoot, { recursive: true });
}

async function ensureConfigRoot(): Promise<void> {
  await mkdir(configRoot, { recursive: true });
}

async function readSettings(): Promise<AppSettings> {
  try {
    const source = await readFile(settingsPath, "utf8");
    return normalizeSettings(JSON.parse(source));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      await writeSettings(defaultSettings);
      return defaultSettings;
    }

    if (error instanceof SyntaxError) {
      return defaultSettings;
    }

    throw error;
  }
}

async function writeSettings(settings: AppSettings): Promise<void> {
  await ensureConfigRoot();
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

async function readWorkspace(): Promise<WorkspaceInfo> {
  return toWorkspaceInfo(await readDocumentsRoot());
}

async function readDocumentsRoot(): Promise<string> {
  return (await readSettings()).documentsRoot;
}

function toWorkspaceInfo(documentsRoot: string): WorkspaceInfo {
  return {
    backendAvailable: true,
    path: documentsRoot,
    configPath: settingsPath,
    defaultPath: defaultDocumentsRoot
  };
}

async function suggestFolders(query: string): Promise<FolderSuggestion[]> {
  const trimmedQuery = query.trim();
  const expandedQuery = trimmedQuery ? resolveUserPath(trimmedQuery) : homedir();
  const hasTrailingSeparator = /[/\\]$/.test(trimmedQuery);
  const directoryPath = hasTrailingSeparator
    ? expandedQuery
    : path.dirname(expandedQuery);
  const prefix = hasTrailingSeparator
    ? ""
    : path.basename(expandedQuery).toLowerCase();

  const entries = await readdir(path.resolve(directoryPath), {
    withFileTypes: true
  }).catch((error: unknown) => {
    if (
      isNodeError(error) &&
      (error.code === "ENOENT" ||
        error.code === "ENOTDIR" ||
        error.code === "EACCES")
    ) {
      return [];
    }

    throw error;
  });

  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        (!prefix || entry.name.toLowerCase().startsWith(prefix))
    )
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 12)
    .map((entry) => ({
      name: entry.name,
      path: path.join(path.resolve(directoryPath), entry.name)
    }));
}

function normalizeSettings(source: unknown): AppSettings {
  const candidate =
    source && typeof source === "object"
      ? (source as Partial<AppSettings>)
      : {};
  const toneOption =
    pianoToneOptions.find((option) => option.id === candidate.pianoTone) ??
    defaultPianoToneOption;

  return {
    pianoTone: toneOption.id,
    pianoProgram: toneOption.program,
    soundFontUrl:
      typeof candidate.soundFontUrl === "string" && candidate.soundFontUrl
        ? candidate.soundFontUrl
        : defaultSettings.soundFontUrl,
    soundFontVolumeMultiplier:
      typeof candidate.soundFontVolumeMultiplier === "number"
        ? clamp(candidate.soundFontVolumeMultiplier, 0, 6)
        : defaultSettings.soundFontVolumeMultiplier,
    documentsRoot:
      typeof candidate.documentsRoot === "string" &&
      candidate.documentsRoot.trim()
        ? resolveUserPath(candidate.documentsRoot)
        : defaultSettings.documentsRoot
  };
}

function toDocumentPath(
  documentId: string,
  documentsRoot: string
): string | null {
  if (!documentIdPattern.test(documentId)) {
    return null;
  }

  return path.join(documentsRoot, `${documentId}.md`);
}

async function nextAvailableDocumentId(
  documentsRoot: string,
  baseDocumentId: string
): Promise<string> {
  const base = sanitizeDocumentId(baseDocumentId) ?? "untitled";

  for (let index = 0; index < 1000; index += 1) {
    const documentId = index === 0 ? base : `${base}-${index + 1}`;
    if (!(await documentExists(documentsRoot, documentId))) {
      return documentId;
    }
  }

  return `${base}-${Date.now()}`;
}

async function documentExists(
  documentsRoot: string,
  documentId: string
): Promise<boolean> {
  const filePath = toDocumentPath(documentId, documentsRoot);
  if (!filePath) {
    return false;
  }

  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function sanitizeDocumentId(source: string): string | null {
  const documentId = source.trim().replace(/\.md$/i, "").toLowerCase();
  return documentIdPattern.test(documentId) ? documentId : null;
}

function slugifyDocumentTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "untitled";
}

function readTitle(markdown: string): string | undefined {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveUserPath(source: string): string {
  const value = source.trim();

  if (value === "~") {
    return homedir();
  }

  if (value.startsWith("~/")) {
    return path.resolve(path.join(homedir(), value.slice(2)));
  }

  if (path.isAbsolute(value)) {
    return path.resolve(value);
  }

  return path.resolve(homedir(), value);
}

function resolveConfigRoot(): string {
  if (process.env.LITERATE_NOTING_CONFIG_DIR) {
    return path.resolve(process.env.LITERATE_NOTING_CONFIG_DIR);
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome && path.isAbsolute(xdgConfigHome)) {
    return path.join(xdgConfigHome, "literate-noting");
  }

  return path.join(homedir(), ".config", "literate-noting");
}

async function readIndexHtml(): Promise<string> {
  return readFile(path.join(staticRoot, "index.html"), "utf8");
}

serve(
  {
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port
  },
  (info) => {
    console.log(
      `Literate Noting backend listening on http://127.0.0.1:${info.port}`
    );
  }
);
