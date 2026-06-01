export type DocumentSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export type MarkdownDocument = DocumentSummary & {
  markdown: string;
};

export type WorkspaceInfo = {
  backendAvailable: boolean;
  path: string;
  configPath?: string;
  defaultPath?: string;
};

export type FolderSuggestion = {
  name: string;
  path: string;
};

export type PianoToneId =
  | "acoustic_grand_piano"
  | "bright_acoustic_piano"
  | "electric_grand_piano"
  | "honkytonk_piano"
  | "electric_piano_1"
  | "electric_piano_2"
  | "harpsichord"
  | "clavinet";

export type AppSettings = {
  pianoTone: PianoToneId;
  pianoProgram: number;
  soundFontUrl: string;
  soundFontVolumeMultiplier: number;
  documentsRoot?: string;
};
