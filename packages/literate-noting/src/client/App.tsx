import {
  FilePlus,
  FileText,
  FolderOpen,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";
import {
  configProvider,
  documentProvider,
  type StoredEditorState
} from "./providers";
import {
  SettingsProvider,
  defaultAppSettings,
  defaultPianoToneOption,
  pianoToneOptions
} from "./settings";
import type {
  AppSettings,
  DocumentSummary,
  FolderSuggestion,
  MarkdownDocument,
  PianoToneId,
  WorkspaceInfo
} from "../shared/types";

type LoadState =
  | { status: "loading"; message: string }
  | { status: "ready" }
  | { status: "error"; message: string };

type EditorLoad = {
  cachedEditorState: StoredEditorState | null;
  key: string;
  markdown: string;
};

export function App() {
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const activeDocumentRef = useRef<MarkdownDocument | null>(null);
  const isDirtyRef = useRef(false);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [activeDocument, setActiveDocument] = useState<MarkdownDocument | null>(
    null
  );
  const [editorLoad, setEditorLoad] = useState<EditorLoad>({
    cachedEditorState: null,
    key: "empty",
    markdown: ""
  });
  const [isDirty, setIsDirty] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsState, setSettingsState] = useState("已同步");
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [folderQuery, setFolderQuery] = useState("");
  const [folderSuggestions, setFolderSuggestions] = useState<
    FolderSuggestion[]
  >([]);
  const [isFolderAutocompleteOpen, setIsFolderAutocompleteOpen] =
    useState(false);
  const [workspaceState, setWorkspaceState] = useState("正在连接");
  const [newDocumentTitle, setNewDocumentTitle] = useState("");
  const [documentActionState, setDocumentActionState] = useState("");
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    message: "正在载入文档"
  });
  const [saveState, setSaveState] = useState("未保存");

  useEffect(() => {
    activeDocumentRef.current = activeDocument;
  }, [activeDocument]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      configProvider.load(),
      documentProvider.getWorkspace(),
      documentProvider.list()
    ])
      .then(async ([loadedSettings, loadedWorkspace, documentList]) => {
        if (!mounted) {
          return;
        }

        setSettings(loadedSettings);
        setWorkspace(loadedWorkspace);
        setFolderQuery(loadedWorkspace.path);
        setWorkspaceState(
          loadedWorkspace.backendAvailable ? "已连接本地文件夹" : "浏览器存储"
        );
        setDocuments(documentList);

        const firstDocument = documentList[0];
        if (!firstDocument) {
          clearActiveDocument();
          return;
        }

        await openDocument(firstDocument.id, mounted);
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return;
        }

        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "文档载入失败。"
        });
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const query = folderQuery.trim();
    if (!isFolderAutocompleteOpen || !query) {
      setFolderSuggestions([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void documentProvider
        .suggestFolders(query)
        .then(setFolderSuggestions)
        .catch(() => setFolderSuggestions([]));
    }, 140);

    return () => window.clearTimeout(timeoutId);
  }, [folderQuery, isFolderAutocompleteOpen]);

  useEffect(() => {
    if (!workspace?.backendAvailable) {
      return;
    }

    let refreshPromise: Promise<void> | null = null;

    return documentProvider.watchDocuments(() => {
      if (refreshPromise) {
        return;
      }

      refreshPromise = refreshDocumentsFromDisk().finally(() => {
        refreshPromise = null;
      });
    });
  }, [workspace?.backendAvailable, workspace?.path]);

  async function refreshDocumentsFromDisk() {
    const currentDocument = activeDocumentRef.current;
    const documentList = await documentProvider.list();

    setDocuments(documentList);

    if (!currentDocument) {
      const firstDocument = documentList[0];
      if (firstDocument) {
        await openDocument(firstDocument.id);
      }
      return;
    }

    const stillExists = documentList.some(
      (document) => document.id === currentDocument.id
    );

    if (!stillExists) {
      if (isDirtyRef.current) {
        setDocumentActionState("磁盘文件已删除，当前草稿未覆盖");
        return;
      }

      const firstDocument = documentList[0];
      if (firstDocument) {
        await openDocument(firstDocument.id);
      } else {
        clearActiveDocument();
      }
      return;
    }

    if (!isDirtyRef.current) {
      await openDocument(currentDocument.id);
    }
  }

  function clearActiveDocument() {
    setActiveDocument(null);
    setEditorLoad({
      cachedEditorState: null,
      key: `empty:${Date.now()}`,
      markdown: ""
    });
    setIsDirty(false);
    setSaveState("未保存");
    setLoadState({ status: "ready" });
  }

  async function openDocument(documentId: string, mounted = true) {
    setLoadState({ status: "loading", message: "正在载入文档" });
    setSaveState("未保存");

    try {
      const [document, draft] = await Promise.all([
        documentProvider.load(documentId),
        documentProvider.loadDraft(documentId)
      ]);

      if (!mounted) {
        return;
      }

      const shouldRestoreDraft =
        draft !== null && draft.updatedAt > document.updatedAt;

      setActiveDocument(document);
      setEditorLoad({
        cachedEditorState: shouldRestoreDraft ? draft.editorState : null,
        key: `${document.id}:${document.updatedAt}:${
          shouldRestoreDraft ? draft.updatedAt : "saved"
        }`,
        markdown: document.markdown
      });
      setIsDirty(shouldRestoreDraft);
      setSaveState(shouldRestoreDraft ? "草稿已恢复" : "已同步");
      setLoadState({ status: "ready" });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : "文档载入失败。"
      });
    }
  }

  async function updatePianoTone(pianoTone: PianoToneId) {
    const toneOption =
      pianoToneOptions.find((option) => option.id === pianoTone) ??
      defaultPianoToneOption;
    const nextSettings: AppSettings = {
      ...settings,
      pianoTone: toneOption.id,
      pianoProgram: toneOption.program
    };

    setSettings(nextSettings);
    setSettingsState("保存中");

    try {
      const savedSettings = await configProvider.save(nextSettings);
      setSettings(savedSettings);
      setSettingsState("已保存");
    } catch (error) {
      setSettingsState(error instanceof Error ? error.message : "保存失败");
    }
  }

  const saveDocument = useCallback(async () => {
    if (!activeDocument) {
      return;
    }

    const markdown =
      editorRef.current?.exportMarkdown() ?? activeDocument.markdown;
    setSaveState("保存中");

    try {
      const savedDocument = await documentProvider.save(
        activeDocument.id,
        markdown
      );
      await documentProvider.clearDraft(activeDocument.id);
      setActiveDocument(savedDocument);
      setDocuments((currentDocuments) =>
        currentDocuments
          .map((document) =>
            document.id === savedDocument.id
              ? toDocumentSummary(savedDocument)
              : document
          )
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      );
      setIsDirty(false);
      setSaveState("已保存");
    } catch (error) {
      setSaveState(error instanceof Error ? error.message : "保存失败");
    }
  }, [activeDocument]);

  async function refreshDocumentList(nextDocumentId?: string | null) {
    const documentList = await documentProvider.list();
    setDocuments(documentList);

    const nextDocument =
      (nextDocumentId
        ? documentList.find((document) => document.id === nextDocumentId)
        : undefined) ?? documentList[0];

    if (!nextDocument) {
      clearActiveDocument();
      return;
    }

    await openDocument(nextDocument.id);
  }

  async function openWorkspace() {
    const nextFolderPath = folderQuery.trim();
    if (!nextFolderPath) {
      return;
    }

    setWorkspaceState("打开中");

    try {
      const nextWorkspace = await documentProvider.openWorkspace(nextFolderPath);
      setWorkspace(nextWorkspace);
      setFolderQuery(nextWorkspace.path);
      setFolderSuggestions([]);
      setIsFolderAutocompleteOpen(false);
      setSettings((currentSettings) => ({
        ...currentSettings,
        documentsRoot: nextWorkspace.path
      }));
      setWorkspaceState("已打开本地文件夹");
      await refreshDocumentList();
    } catch (error) {
      setWorkspaceState(error instanceof Error ? error.message : "打开失败");
    }
  }

  async function createDocument() {
    setDocumentActionState("新建中");

    try {
      const document = await documentProvider.create(newDocumentTitle);
      setNewDocumentTitle("");
      setDocumentActionState("已新建");
      await refreshDocumentList(document.id);
    } catch (error) {
      setDocumentActionState(
        error instanceof Error ? error.message : "新建失败"
      );
    }
  }

  async function deleteActiveDocument() {
    if (!activeDocument) {
      return;
    }

    const shouldDelete = window.confirm(`删除 ${activeDocument.title}？`);
    if (!shouldDelete) {
      return;
    }

    const deletedDocumentId = activeDocument.id;
    setDocumentActionState("删除中");

    try {
      await documentProvider.delete(deletedDocumentId);
      setDocumentActionState("已删除");
      const nextDocument =
        documents.find((document) => document.id !== deletedDocumentId) ?? null;
      await refreshDocumentList(nextDocument?.id ?? null);
    } catch (error) {
      setDocumentActionState(
        error instanceof Error ? error.message : "删除失败"
      );
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveDocument();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveDocument]);

  function cacheEditorState(editorState: StoredEditorState) {
    if (!activeDocument) {
      return;
    }

    void documentProvider.saveDraft({
      documentId: activeDocument.id,
      baseUpdatedAt: activeDocument.updatedAt,
      editorState,
      updatedAt: new Date().toISOString()
    });
    setIsDirty(true);
    setSaveState("草稿已缓存");
  }

  const activeDocumentId = activeDocument?.id;

  return (
    <main className="app-shell">
      <aside className="document-sidebar" aria-label="文档">
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">Markdown</p>
            <h1>Literate Noting</h1>
          </div>
          <FileText size={20} />
        </div>

        <div className="folder-picker">
          <label className="sidebar-label" htmlFor="folder-path">
            文件夹
          </label>
          <div className="folder-input-row">
            <input
              autoComplete="off"
              className="sidebar-input"
              id="folder-path"
              onChange={(event) => {
                setFolderQuery(event.target.value);
                setIsFolderAutocompleteOpen(true);
              }}
              onFocus={() => setIsFolderAutocompleteOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void openWorkspace();
                }
              }}
              placeholder="~/notes"
              spellCheck={false}
              value={folderQuery}
            />
            <button
              aria-label="打开文件夹"
              className="sidebar-icon-button"
              onClick={() => void openWorkspace()}
              title="打开文件夹"
              type="button"
            >
              <FolderOpen size={16} />
            </button>
          </div>

          {isFolderAutocompleteOpen && folderSuggestions.length > 0 ? (
            <div className="folder-suggestions" role="listbox">
              {folderSuggestions.map((suggestion) => (
                <button
                  className="folder-suggestion"
                  key={suggestion.path}
                  onClick={() => {
                    setFolderQuery(suggestion.path);
                    setFolderSuggestions([]);
                    setIsFolderAutocompleteOpen(false);
                  }}
                  role="option"
                  type="button"
                >
                  <span>{suggestion.name}</span>
                  <small>{suggestion.path}</small>
                </button>
              ))}
            </div>
          ) : null}

          <p className="sidebar-status">
            {workspace
              ? workspace.backendAvailable
                ? workspaceState
                : "浏览器存储"
              : workspaceState}
          </p>
        </div>

        <div className="document-tools">
          <label className="sidebar-label" htmlFor="new-document-title">
            新建文件
          </label>
          <div className="folder-input-row">
            <input
              className="sidebar-input"
              id="new-document-title"
              onChange={(event) => setNewDocumentTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void createDocument();
                }
              }}
              placeholder="Untitled"
              value={newDocumentTitle}
            />
            <button
              aria-label="新建文件"
              className="sidebar-icon-button"
              onClick={() => void createDocument()}
              title="新建文件"
              type="button"
            >
              <FilePlus size={16} />
            </button>
            <button
              aria-label="删除当前文件"
              className="sidebar-icon-button sidebar-icon-button-danger"
              disabled={!activeDocument}
              onClick={() => void deleteActiveDocument()}
              title="删除当前文件"
              type="button"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <p className="sidebar-status">{documentActionState || " "}</p>
        </div>

        <nav className="document-list">
          {documents.map((document) => (
            <button
              className={
                document.id === activeDocumentId
                  ? "document-item document-item-active"
                  : "document-item"
              }
              key={document.id}
              onClick={() => void openDocument(document.id)}
              type="button"
            >
              <span className="document-title">{document.title}</span>
              <span className="document-meta">
                {formatUpdatedAt(document.updatedAt)}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">当前文档</p>
            <h2>{activeDocument?.title ?? "未选择"}</h2>
          </div>
          <div className="workspace-actions">
            <span className={isDirty ? "save-status dirty" : "save-status"}>
              {isDirty ? "有改动" : saveState}
            </span>
            <button
              className="action-button"
              onClick={() => setIsSettingsOpen(true)}
              title="设置"
              type="button"
            >
              <SlidersHorizontal size={16} />
              设置
            </button>
            <button
              className="action-button"
              disabled={!activeDocument}
              onClick={() => {
                if (activeDocument) {
                  void openDocument(activeDocument.id);
                }
              }}
              title="重新载入"
              type="button"
            >
              <RefreshCw size={16} />
              重载
            </button>
            <button
              className="action-button action-button-primary"
              disabled={!activeDocument || !isDirty}
              onClick={() => void saveDocument()}
              title="保存"
              type="button"
            >
              <Save size={16} />
              保存
            </button>
          </div>
        </header>

        <section className="editor-panel">
          {loadState.status === "ready" && activeDocument ? (
            <SettingsProvider settings={settings}>
              <MarkdownEditor
                cachedEditorState={editorLoad.cachedEditorState}
                loadKey={editorLoad.key}
                markdown={editorLoad.markdown}
                ref={editorRef}
                onEditorStateChange={cacheEditorState}
              />
            </SettingsProvider>
          ) : loadState.status === "ready" ? (
            <div className="status-panel" aria-live="polite">
              <div className="empty-state">
                <p className="status-text">这个文件夹还没有 Markdown 文件。</p>
                <button
                  className="action-button action-button-primary"
                  onClick={() => void createDocument()}
                  type="button"
                >
                  <FilePlus size={16} />
                  新建文件
                </button>
              </div>
            </div>
          ) : (
            <div className="status-panel" aria-live="polite">
              <p
                className={
                  loadState.status === "error"
                    ? "status-text status-text-error"
                    : "status-text"
                }
              >
                {loadState.message}
              </p>
            </div>
          )}
        </section>

        {isSettingsOpen ? (
          <SettingsPanel
            settings={settings}
            settingsState={settingsState}
            onClose={() => setIsSettingsOpen(false)}
            onPianoToneChange={(pianoTone) => void updatePianoTone(pianoTone)}
          />
        ) : null}
      </section>
    </main>
  );
}

function SettingsPanel({
  onClose,
  onPianoToneChange,
  settings,
  settingsState
}: {
  onClose: () => void;
  onPianoToneChange: (pianoTone: PianoToneId) => void;
  settings: AppSettings;
  settingsState: string;
}) {
  return (
    <aside className="settings-panel" aria-label="设置">
      <div className="settings-panel-header">
        <div>
          <p className="eyebrow">Audio</p>
          <h3>设置</h3>
        </div>
        <button
          aria-label="关闭设置"
          className="icon-button"
          onClick={onClose}
          title="关闭"
          type="button"
        >
          <X size={16} />
        </button>
      </div>

      <label className="settings-field">
        <span>钢琴音色</span>
        <select
          className="settings-select"
          value={settings.pianoTone}
          onChange={(event) =>
            onPianoToneChange(event.target.value as PianoToneId)
          }
        >
          {pianoToneOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="settings-readout">
        <span>Program</span>
        <strong>{settings.pianoProgram}</strong>
      </div>
      <p className="settings-status">{settingsState}</p>
    </aside>
  );
}

function toDocumentSummary(document: MarkdownDocument): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    updatedAt: document.updatedAt
  };
}

function formatUpdatedAt(updatedAt: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(updatedAt));
}
