export type DeskDuckError = {
  box_2d: [number, number, number, number];
  label: string;
  explanation: string;
};

export type AnalysisUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type AnalysisResult = {
  errors: DeskDuckError[];
  usage?: AnalysisUsage;
};

/** One photographed page of handwritten notes. */
export type NotesPage = {
  id: string;
  name: string;
  /** Downscaled JPEG data URL: the preview and the upload payload. */
  dataUrl: string;
  latex?: string;
  /** Anything Gemini had to guess while reading the page. */
  uncertainty?: string;
  error?: string;
};

export type NotesPagePayload = {
  page: number;
  latex: string;
  uncertainty?: string;
};

export type NotesResult = {
  title?: string;
  pages: NotesPagePayload[];
  usage?: AnalysisUsage;
};
