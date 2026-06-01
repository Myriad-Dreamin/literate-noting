import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import type {
  AppSettings,
  DocumentSummary,
  FolderSuggestion,
  MarkdownDocument,
  WorkspaceInfo
} from "../shared/types";
import { defaultAppSettings } from "./settings";

export type StoredEditorState = SerializedEditorState<SerializedLexicalNode>;

export type DocumentDraft = {
  documentId: string;
  baseUpdatedAt: string;
  editorState: StoredEditorState;
  updatedAt: string;
};

type StorageRecord<T> = {
  key: string;
  value: T;
};

type JsonRequestResult<T> =
  | { data: T; ok: true }
  | { message: string; ok: false; status?: number; unavailable: boolean };

export type DocumentWatchEvent = {
  event: "add" | "change" | "gitignore" | "unlink";
  id?: string;
  updatedAt: string;
};

const databaseName = "literate-noting";
const databaseVersion = 1;
const recordStoreName = "records";
const localStoragePrefix = "literate-noting:";
const settingsKey = "settings";
const documentIndexKey = "documents:index";
const fallbackMarkdown = `# Literate Noting

这是一个本地 Markdown 文档。后端不可用时，前端会继续使用 localStorage 和 IndexedDB。

行内 ABC notation 会显示成音符：{C D E F | G A B c}

\`\`\`abc note
X:1
T:Local tune
M:4/4
L:1/8
K:C
CDEF GABc | cBAG FEDC |
\`\`\`
`;

export const configProvider = {
  async load(): Promise<AppSettings> {
    const [browserSettings, backendSettings] = await Promise.all([
      readBrowserSettings(),
      readBackendSettings()
    ]);

    if (browserSettings && backendSettings) {
      const settings = mergeSettings(backendSettings, browserSettings);
      const rememberedSettings = backendSettings.documentsRoot
        ? {
            ...settings,
            documentsRoot: backendSettings.documentsRoot
          }
        : settings;
      await writeBrowserSettings(rememberedSettings);
      void syncSettingsToBackend(rememberedSettings);
      return rememberedSettings;
    }

    if (browserSettings) {
      void syncSettingsToBackend(browserSettings);
      return browserSettings;
    }

    const settings = backendSettings ?? defaultAppSettings;
    await writeBrowserSettings(settings);

    if (!backendSettings) {
      void syncSettingsToBackend(settings);
    }

    return settings;
  },

  async save(settings: AppSettings): Promise<AppSettings> {
    await writeBrowserSettings(settings);

    const backendSettings = await syncSettingsToBackend(settings);
    if (backendSettings) {
      await writeBrowserSettings(backendSettings);
      return backendSettings;
    }

    return settings;
  }
};

export const documentProvider = {
  async list(): Promise<DocumentSummary[]> {
    const backendDocuments = await readBackendDocumentList();
    if (backendDocuments !== null) {
      const loadedDocuments = await Promise.all(
        backendDocuments.map((document) => readBackendDocument(document.id))
      );
      const availableDocuments = loadedDocuments.filter(
        (document): document is MarkdownDocument => document !== null
      );
      await Promise.all(
        availableDocuments.map((document) => writeBrowserDocument(document))
      );
      return summarizeDocuments(availableDocuments);
    }

    const browserDocuments = await readBrowserDocuments();
    if (browserDocuments.length > 0) {
      return summarizeDocuments(browserDocuments);
    }

    const fallbackDocument = createFallbackDocument();
    await writeBrowserDocument(fallbackDocument);
    return [toDocumentSummary(fallbackDocument)];
  },

  async load(documentId: string): Promise<MarkdownDocument> {
    const browserDocument = await readBrowserDocument(documentId);
    if (browserDocument) {
      return browserDocument;
    }

    const backendDocument = await readBackendDocument(documentId);
    if (backendDocument) {
      await writeBrowserDocument(backendDocument);
      return backendDocument;
    }

    const fallbackDocument = createFallbackDocument(documentId);
    await writeBrowserDocument(fallbackDocument);
    return fallbackDocument;
  },

  async save(documentId: string, markdown: string): Promise<MarkdownDocument> {
    const localDocument: MarkdownDocument = {
      id: documentId,
      title: readTitle(markdown) ?? documentId,
      markdown,
      updatedAt: new Date().toISOString()
    };

    await writeBrowserDocument(localDocument);

    const backendDocument = await writeBackendDocument(documentId, markdown);
    if (backendDocument) {
      await writeBrowserDocument(backendDocument);
      return backendDocument;
    }

    return localDocument;
  },

  async create(title: string): Promise<MarkdownDocument> {
    const normalizedTitle = title.trim() || "Untitled";
    const browserDocuments = await readBrowserDocuments();
    const documentId = nextLocalDocumentId(
      slugifyDocumentTitle(normalizedTitle),
      browserDocuments.map((document) => document.id)
    );
    const localDocument = createBlankDocument(normalizedTitle, documentId);
    const backendDocument = await createBackendDocument(localDocument);

    if (backendDocument) {
      await writeBrowserDocument(backendDocument);
      return backendDocument;
    }

    await writeBrowserDocument(localDocument);
    return localDocument;
  },

  async delete(documentId: string): Promise<void> {
    const backendResult = await deleteBackendDocument(documentId);

    if (backendResult.ok || backendResult.unavailable) {
      await deleteBrowserDocument(documentId);
      return;
    }

    throw new Error(backendResult.message);
  },

  async getWorkspace(): Promise<WorkspaceInfo> {
    const data = await requestJsonOrNull<{ workspace: WorkspaceInfo }>(
      "/api/workspace"
    );
    if (data?.workspace) {
      return data.workspace;
    }

    const settings = await readBrowserSettings();
    return {
      backendAvailable: false,
      path: settings?.documentsRoot ?? "浏览器存储"
    };
  },

  async openWorkspace(folderPath: string): Promise<WorkspaceInfo> {
    const result = await requestJson<{ workspace: WorkspaceInfo }>(
      "/api/workspace",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ path: folderPath })
      }
    );

    if (!result.ok) {
      throw new Error(
        result.unavailable ? "打开本地文件夹需要 Hono 后端。" : result.message
      );
    }

    await mergeBrowserSettings({
      documentsRoot: result.data.workspace.path
    });

    return result.data.workspace;
  },

  async suggestFolders(query: string): Promise<FolderSuggestion[]> {
    const data = await requestJsonOrNull<{ suggestions: FolderSuggestion[] }>(
      `/api/folders/suggest?query=${encodeURIComponent(query)}`
    );

    return data?.suggestions ?? [];
  },

  watchDocuments(onChange: (event: DocumentWatchEvent) => void): () => void {
    if (!("EventSource" in window)) {
      return () => {};
    }

    const eventSource = new EventSource("/api/documents/events");

    eventSource.addEventListener("documents-changed", (event) => {
      onChange(JSON.parse(event.data) as DocumentWatchEvent);
    });

    return () => eventSource.close();
  },

  async loadDraft(documentId: string): Promise<DocumentDraft | null> {
    return readBrowserDraft(documentId);
  },

  async saveDraft(draft: DocumentDraft): Promise<void> {
    await writeBrowserDraft(draft);
  },

  async clearDraft(documentId: string): Promise<void> {
    await deleteBrowserDraft(documentId);
  }
};

async function readBrowserSettings(): Promise<AppSettings | null> {
  return (
    readLocalRecord<AppSettings>(settingsKey) ??
    (await readIndexedRecord<AppSettings>(settingsKey))
  );
}

async function writeBrowserSettings(settings: AppSettings): Promise<void> {
  writeLocalRecord(settingsKey, settings);
  await writeIndexedRecord(settingsKey, settings);
}

async function mergeBrowserSettings(
  settings: Partial<AppSettings>
): Promise<AppSettings> {
  const currentSettings = await readBrowserSettings();
  const mergedSettings = mergeSettings(
    currentSettings ?? defaultAppSettings,
    settings
  );
  await writeBrowserSettings(mergedSettings);
  return mergedSettings;
}

function mergeSettings(
  baseSettings: AppSettings,
  overrideSettings: Partial<AppSettings>
): AppSettings {
  const mergedSettings: AppSettings = {
    ...baseSettings,
    ...overrideSettings
  };
  const documentsRoot =
    overrideSettings.documentsRoot ?? baseSettings.documentsRoot;

  return documentsRoot
    ? {
        ...mergedSettings,
        documentsRoot
      }
    : mergedSettings;
}

async function readBackendSettings(): Promise<AppSettings | null> {
  const data = await requestJsonOrNull<{ settings: AppSettings }>("/api/settings");
  return data?.settings ?? null;
}

async function syncSettingsToBackend(
  settings: AppSettings
): Promise<AppSettings | null> {
  const data = await requestJsonOrNull<{ settings: AppSettings }>("/api/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ settings })
  });

  return data?.settings ?? null;
}

async function readBrowserDocuments(): Promise<MarkdownDocument[]> {
  const localDocuments = readLocalDocumentIndex()
    .map((documentId) => readLocalRecord<MarkdownDocument>(documentKey(documentId)))
    .filter((document): document is MarkdownDocument => document !== null);
  const indexedDocuments =
    await readIndexedRecordsByPrefix<MarkdownDocument>("document:");
  const documents = new Map<string, MarkdownDocument>();

  for (const document of [...localDocuments, ...indexedDocuments]) {
    const current = documents.get(document.id);
    if (!current || document.updatedAt > current.updatedAt) {
      documents.set(document.id, document);
    }
  }

  return [...documents.values()];
}

async function readBrowserDocument(
  documentId: string
): Promise<MarkdownDocument | null> {
  return (
    readLocalRecord<MarkdownDocument>(documentKey(documentId)) ??
    (await readIndexedRecord<MarkdownDocument>(documentKey(documentId)))
  );
}

async function writeBrowserDocument(document: MarkdownDocument): Promise<void> {
  writeLocalDocumentIndex(document.id);
  writeLocalRecord(documentKey(document.id), document);
  await writeIndexedRecord(documentKey(document.id), document);
}

async function deleteBrowserDocument(documentId: string): Promise<void> {
  deleteLocalDocumentIndex(documentId);
  deleteLocalRecord(documentKey(documentId));
  deleteLocalRecord(draftKey(documentId));
  await Promise.all([
    deleteIndexedRecord(documentKey(documentId)),
    deleteIndexedRecord(draftKey(documentId))
  ]);
}

async function readBackendDocumentList(): Promise<DocumentSummary[] | null> {
  const data = await requestJsonOrNull<{ documents: DocumentSummary[] }>(
    "/api/documents"
  );
  return data?.documents ?? null;
}

async function readBackendDocument(
  documentId: string
): Promise<MarkdownDocument | null> {
  const data = await requestJsonOrNull<{ document: MarkdownDocument }>(
    `/api/documents/${documentId}`
  );
  return data?.document ?? null;
}

async function writeBackendDocument(
  documentId: string,
  markdown: string
): Promise<MarkdownDocument | null> {
  const data = await requestJsonOrNull<{ document: MarkdownDocument }>(
    `/api/documents/${documentId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ markdown })
    }
  );

  return data?.document ?? null;
}

async function createBackendDocument(
  document: MarkdownDocument
): Promise<MarkdownDocument | null> {
  const result = await requestJson<{ document: MarkdownDocument }>(
    "/api/documents",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: document.id,
        markdown: document.markdown,
        title: document.title
      })
    }
  );

  if (result.ok) {
    return result.data.document;
  }

  if (result.unavailable) {
    return null;
  }

  throw new Error(result.message);
}

async function deleteBackendDocument(
  documentId: string
): Promise<JsonRequestResult<{ deletedDocumentId: string }>> {
  return requestJson<{ deletedDocumentId: string }>(
    `/api/documents/${documentId}`,
    {
      method: "DELETE"
    }
  );
}

async function readBrowserDraft(
  documentId: string
): Promise<DocumentDraft | null> {
  return (
    readLocalRecord<DocumentDraft>(draftKey(documentId)) ??
    (await readIndexedRecord<DocumentDraft>(draftKey(documentId)))
  );
}

async function writeBrowserDraft(draft: DocumentDraft): Promise<void> {
  writeLocalRecord(draftKey(draft.documentId), draft);
  await writeIndexedRecord(draftKey(draft.documentId), draft);
}

async function deleteBrowserDraft(documentId: string): Promise<void> {
  deleteLocalRecord(draftKey(documentId));
  await deleteIndexedRecord(draftKey(documentId));
}

async function requestJsonOrNull<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T | null> {
  const result = await requestJson<T>(input, init);
  return result.ok ? result.data : null;
}

async function requestJson<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<JsonRequestResult<T>> {
  try {
    const response = await fetch(input, init);
    if (!response.ok) {
      return {
        ok: false,
        unavailable: false,
        status: response.status,
        message: await readResponseMessage(response)
      };
    }

    return {
      ok: true,
      data: (await response.json()) as T
    };
  } catch {
    return {
      ok: false,
      unavailable: true,
      message: "Backend unavailable."
    };
  }
}

async function readResponseMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error) {
      return data.error;
    }
  } catch {
    // Ignore malformed error bodies and use the status text below.
  }

  return response.statusText || "Request failed.";
}

function readLocalDocumentIndex(): string[] {
  return readLocalRecord<string[]>(documentIndexKey) ?? [];
}

function writeLocalDocumentIndex(documentId: string): void {
  const documentIds = new Set(readLocalDocumentIndex());
  documentIds.add(documentId);
  writeLocalRecord(documentIndexKey, [...documentIds]);
}

function deleteLocalDocumentIndex(documentId: string): void {
  writeLocalRecord(
    documentIndexKey,
    readLocalDocumentIndex().filter(
      (currentDocumentId) => currentDocumentId !== documentId
    )
  );
}

function readLocalRecord<T>(key: string): T | null {
  try {
    const source = localStorage.getItem(localStorageKey(key));
    return source ? (JSON.parse(source) as T) : null;
  } catch {
    return null;
  }
}

function writeLocalRecord<T>(key: string, value: T): void {
  localStorage.setItem(localStorageKey(key), JSON.stringify(value));
}

function deleteLocalRecord(key: string): void {
  localStorage.removeItem(localStorageKey(key));
}

async function readIndexedRecord<T>(key: string): Promise<T | null> {
  const database = await openDatabase();
  if (!database) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = database
      .transaction(recordStoreName, "readonly")
      .objectStore(recordStoreName)
      .get(key);

    request.onsuccess = () => {
      resolve((request.result as StorageRecord<T> | undefined)?.value ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

async function readIndexedRecordsByPrefix<T>(prefix: string): Promise<T[]> {
  const database = await openDatabase();
  if (!database) {
    return [];
  }

  return new Promise((resolve, reject) => {
    const records: T[] = [];
    const request = database
      .transaction(recordStoreName, "readonly")
      .objectStore(recordStoreName)
      .openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(records);
        return;
      }

      const record = cursor.value as StorageRecord<T>;
      if (record.key.startsWith(prefix)) {
        records.push(record.value);
      }

      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

async function writeIndexedRecord<T>(key: string, value: T): Promise<void> {
  const database = await openDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction(recordStoreName, "readwrite")
      .objectStore(recordStoreName)
      .put({ key, value });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function deleteIndexedRecord(key: string): Promise<void> {
  const database = await openDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction(recordStoreName, "readwrite")
      .objectStore(recordStoreName)
      .delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!("indexedDB" in window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(recordStoreName)) {
        database.createObjectStore(recordStoreName, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function summarizeDocuments(documents: MarkdownDocument[]): DocumentSummary[] {
  return documents
    .map(toDocumentSummary)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function toDocumentSummary(document: MarkdownDocument): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    updatedAt: document.updatedAt
  };
}

function createFallbackDocument(documentId = "welcome"): MarkdownDocument {
  return {
    id: documentId,
    title: "Literate Noting",
    markdown: fallbackMarkdown,
    updatedAt: new Date().toISOString()
  };
}

function createBlankDocument(title: string, documentId: string): MarkdownDocument {
  return {
    id: documentId,
    title,
    markdown: `# ${title}\n\n`,
    updatedAt: new Date().toISOString()
  };
}

function nextLocalDocumentId(baseDocumentId: string, existingIds: string[]): string {
  const existingIdSet = new Set(existingIds);

  for (let index = 0; index < 1000; index += 1) {
    const documentId =
      index === 0 ? baseDocumentId : `${baseDocumentId}-${index + 1}`;
    if (!existingIdSet.has(documentId)) {
      return documentId;
    }
  }

  return `${baseDocumentId}-${Date.now()}`;
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

function documentKey(documentId: string): string {
  return `document:${documentId}`;
}

function draftKey(documentId: string): string {
  return `draft:${documentId}`;
}

function localStorageKey(key: string): string {
  return `${localStoragePrefix}${key}`;
}
