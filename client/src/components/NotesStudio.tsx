import { useMemo, useRef, useState } from "react";
import { AnalysisUsage, NotesPage, NotesResult } from "../types";
import { dataUrlToBase64 } from "../utils/media";
import { fileToPageImage } from "../utils/image";
import { renderLatex } from "../utils/latex";
import {
  buildLatexDocument,
  downloadTextFile,
  formatToday,
  slugify
} from "../utils/notes";

type Props = {
  onStatus: (status: string) => void;
};

type Tab = "preview" | "latex";

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SheetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M6 3h8l4 4v14H6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M14 3v4h4M9 12h6M9 16h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M9 8 5 12l4 4M15 8l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M15 6.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

let pageCounter = 0;

function nextPageId(): string {
  pageCounter += 1;
  return `page-${Date.now()}-${pageCounter}`;
}

export default function NotesStudio({ onStatus }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pages, setPages] = useState<NotesPage[]>([]);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [instructions, setInstructions] = useState("");
  const [latex, setLatex] = useState("");
  const [usage, setUsage] = useState<AnalysisUsage | null>(null);
  const [tab, setTab] = useState<Tab>("preview");
  const [translating, setTranslating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [attachScans, setAttachScans] = useState(false);
  const [activePageId, setActivePageId] = useState<string | null>(null);

  const rendered = useMemo(() => renderLatex(latex), [latex]);

  const latexDocument = useMemo(
    () => buildLatexDocument({ title, author, body: latex }),
    [title, author, latex]
  );

  const fileBase = slugify(title.trim() || "handwritten-notes");
  const hasPages = pages.length > 0;
  const hasDocument = latex.trim().length > 0;

  const wordCount = useMemo(() => {
    const words = latex
      .replace(/\\[a-zA-Z]+/g, " ")
      .replace(/[{}$&_^~\\]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1);

    return words.length;
  }, [latex]);

  async function addFiles(list: File[]) {
    const images = list.filter((file) => file.type.startsWith("image/"));

    if (!images.length || adding) return;

    setAdding(true);
    setError("");

    const added: NotesPage[] = [];

    for (const file of images) {
      try {
        const dataUrl = await fileToPageImage(file);

        added.push({ id: nextPageId(), name: file.name, dataUrl });
      } catch (fileError) {
        console.error(fileError);
        setError(
          fileError instanceof Error
            ? fileError.message
            : `Could not read ${file.name}.`
        );
      }
    }

    setPages((current) => [...current, ...added]);
    setAdding(false);

    if (added.length) {
      onStatus(
        `${pages.length + added.length} page(s) ready — convert when every page is in.`
      );
    }
  }

  function movePage(index: number, delta: number) {
    setPages((current) => {
      const target = index + delta;

      if (target < 0 || target >= current.length) return current;

      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);

      return next;
    });
  }

  function removePage(id: string) {
    setPages((current) => current.filter((page) => page.id !== id));
  }

  function clearAll() {
    if (!window.confirm("Remove every page photo and the transcript?")) return;

    setPages([]);
    setLatex("");
    setUsage(null);
    setError("");
    setTitle("");
    setAuthor("");
    setInstructions("");
    onStatus("Notes workspace cleared.");
  }

  async function transcribe() {
    if (!hasPages || translating) return;

    const payload = pages.map((page) => ({
      imageBase64: dataUrlToBase64(page.dataUrl),
      imageMimeType: "image/jpeg"
    }));

    // The server accepts 15mb of JSON; catch oversized batches here so the
    // failure is explained rather than a bare 413.
    const encodedSize = payload.reduce(
      (total, page) => total + page.imageBase64.length,
      0
    );

    if (encodedSize > 13_000_000) {
      setError(
        "These photos add up to more than the request can carry — remove a page or two, or retake them at a smaller size."
      );
      return;
    }

    setTranslating(true);
    setError("");
    setUsage(null);
    onStatus(`Reading ${payload.length} page(s) into LaTeX...`);

    try {
      const response = await fetch("/api/notes/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          pages: payload,
          instructions: instructions.trim() || undefined
        })
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Transcription failed.");
      }

      const result = body as NotesResult;
      const byPage = new Map(result.pages.map((page) => [page.page, page]));
      const transcriptions = pages.map(
        (_page, index) => (byPage.get(index + 1)?.latex ?? "").trim()
      );

      setLatex(transcriptions.filter(Boolean).join("\n\n"));
      setPages((current) =>
        current.map((page, index) => ({
          ...page,
          latex: transcriptions[index] || undefined,
          uncertainty:
            byPage.get(index + 1)?.uncertainty?.trim() || undefined,
          error: transcriptions[index]
            ? undefined
            : "No writing was found on this page."
        }))
      );
      setTitle((current) => current || (result.title ?? "").trim());
      setUsage(result.usage ?? null);
      setTab("preview");
      onStatus(`${pages.length} page(s) transcribed.`);
    } catch (fetchError) {
      console.error(fetchError);
      setError(
        fetchError instanceof Error ? fetchError.message : "Transcription failed."
      );
      onStatus("Transcription failed.");
    } finally {
      setTranslating(false);
    }
  }

  /**
   * The PDF comes from the browser's own print engine, so the typeset text
   * stays vector and selectable. Chrome/Edge offer "Save as PDF" by default.
   */
  function downloadPdf() {
    setTab("preview");

    window.setTimeout(() => {
      const previousTitle = window.document.title;
      const restore = () => {
        window.document.title = previousTitle;
      };

      window.document.title = fileBase;
      window.addEventListener("afterprint", restore, { once: true });
      window.print();
      window.setTimeout(restore, 5000);
    }, 80);
  }

  function downloadTex() {
    downloadTextFile(`${fileBase}.tex`, latexDocument, "application/x-tex");
    onStatus("LaTeX file downloaded.");
  }

  async function copyLatex() {
    try {
      await navigator.clipboard.writeText(latexDocument);
      onStatus("LaTeX copied to the clipboard.");
    } catch (copyError) {
      console.error(copyError);
      setError("This browser would not let DeskDuck use the clipboard.");
    }
  }

  return (
    <section className="studio">
      <div className="studio-main">
        <div className="studio-bar">
          <div className="studio-tabs" role="tablist" aria-label="Notes view">
            <button
              className={`studio-tab ${tab === "preview" ? "active" : ""}`}
              onClick={() => setTab("preview")}
              role="tab"
              aria-selected={tab === "preview"}
              type="button"
            >
              Preview
            </button>
            <button
              className={`studio-tab ${tab === "latex" ? "active" : ""}`}
              onClick={() => setTab("latex")}
              role="tab"
              aria-selected={tab === "latex"}
              type="button"
            >
              LaTeX
            </button>
          </div>

          <div className="studio-meta">
            <span>
              {pages.length} page{pages.length === 1 ? "" : "s"}
            </span>
            {hasDocument && (
              <>
                <span className="meta-dot" />
                <span>{wordCount} words</span>
              </>
            )}
          </div>
        </div>

        <div className={`paper-stage tab-${tab}`}>
          <div className="paper-shell-scroll">
            <article className="paper" aria-label="Typeset document preview">
              {(title.trim() || author.trim()) && (
                <header className="paper-head">
                  {title.trim() && <h1 className="paper-title">{title}</h1>}
                  {author.trim() && <p className="paper-author">{author}</p>}
                  <p className="paper-date">{formatToday()}</p>
                </header>
              )}

              {hasDocument ? (
                <div
                  className="paper-body"
                  // Rendered from the transcription by utils/latex.ts.
                  dangerouslySetInnerHTML={{ __html: rendered.html }}
                />
              ) : (
                <div className="paper-empty">
                  <span className="paper-empty-mark">Aa</span>
                  <p>Your typed pages appear here</p>
                  <span>
                    Add photos of your handwriting, then press{" "}
                    <strong>Convert to LaTeX</strong>.
                  </span>
                </div>
              )}
            </article>

            {attachScans &&
              pages.map((page, index) => (
                <figure className="paper-scan" key={page.id}>
                  <img src={page.dataUrl} alt={`Original page ${index + 1}`} />
                  <figcaption>Original photo — page {index + 1}</figcaption>
                </figure>
              ))}
          </div>

          <div className="latex-pane">
            <textarea
              className="latex-source"
              value={latex}
              onChange={(event) => setLatex(event.target.value)}
              spellCheck={false}
              placeholder={
                "\\section*{Question 1}\nThe limiting case is $x \\to 0$...\n\nEdit the LaTeX here and the preview updates."
              }
            />
            <p className="input-hint">
              This is the transcript — fix anything the reader misheard and the
              preview, PDF and <code>.tex</code> all follow.
            </p>
          </div>
        </div>

        {rendered.warnings.length > 0 && (
          <p className="studio-warning">
            {rendered.warnings.length} piece(s) of LaTeX were not rendered —
            open the LaTeX tab to fix them. First up:{" "}
            <code>{rendered.warnings[0]}</code>
          </p>
        )}
      </div>

      <aside className="panel studio-side">
        <div className="panel-head">
          <h2>Handwriting to PDF</h2>
          <SheetIcon />
        </div>

        <p className="hint">
          Photograph every page of your written work. DeskDuck transcribes it
          into LaTeX and typesets a PDF you can hand in.
        </p>

        <div
          className={`dropzone ${dragging ? "dragging" : ""} ${
            adding ? "busy" : ""
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void addFiles(Array.from(event.dataTransfer.files));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <span className="dropzone-icon">
            <PlusIcon />
          </span>
          <strong>{adding ? "Reading photos..." : "Add page photos"}</strong>
          <span>Tap to choose, or drop images here</span>

          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              void addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </div>

        {hasPages && (
          <ol className="page-list">
            {pages.map((page, index) => (
              <li
                key={page.id}
                className={`page-item ${activePageId === page.id ? "active" : ""} ${
                  page.error ? "failed" : ""
                }`}
                onMouseEnter={() => setActivePageId(page.id)}
                onMouseLeave={() => setActivePageId(null)}
              >
                <img src={page.dataUrl} alt="" />

                <div className="page-info">
                  <strong>Page {index + 1}</strong>
                  <span>
                    {page.error
                      ? page.error
                      : page.uncertainty
                        ? `Unclear: ${page.uncertainty}`
                        : page.latex
                          ? "Transcribed"
                          : "Ready to convert"}
                  </span>
                </div>

                <div className="page-actions">
                  <button
                    className="mini"
                    onClick={() => movePage(index, -1)}
                    disabled={index === 0}
                    title="Move earlier"
                    aria-label={`Move page ${index + 1} earlier`}
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    className="mini"
                    onClick={() => movePage(index, 1)}
                    disabled={index === pages.length - 1}
                    title="Move later"
                    aria-label={`Move page ${index + 1} later`}
                    type="button"
                  >
                    ↓
                  </button>
                  <button
                    className="mini danger"
                    onClick={() => removePage(page.id)}
                    title="Remove page"
                    aria-label={`Remove page ${index + 1}`}
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="field-grid">
          <label className="field">
            <span>Title</span>
            <input
              className="text-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Thermodynamics — Lecture 4"
            />
          </label>

          <label className="field">
            <span>Name</span>
            <input
              className="text-input"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Your name"
            />
          </label>
        </div>

        <label className="field">
          <span>Reading note for DeskDuck (optional)</span>
          <input
            className="text-input"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="e.g. keep the German technical terms"
          />
        </label>

        <div className="input-actions">
          <button
            className="btn primary"
            onClick={transcribe}
            disabled={!hasPages || translating}
            type="button"
          >
            <SparkIcon />
            {translating
              ? "Reading pages..."
              : `Convert ${pages.length || ""} page${
                  pages.length === 1 ? "" : "s"
                } to LaTeX`}
          </button>

          <button
            className="btn ghost"
            onClick={clearAll}
            disabled={!hasPages || translating}
            type="button"
          >
            Clear
          </button>
        </div>

        {translating && (
          <div className="loading">
            <div className="spinner" />
            Gemini is reading {pages.length} page{pages.length === 1 ? "" : "s"}...
          </div>
        )}

        {error && <p className="studio-error">{error}</p>}

        {usage && (usage.inputTokens || usage.outputTokens) && (
          <div className="stat-chips">
            <div className="stat-chip">
              <span>Input</span>
              <strong>{usage.inputTokens?.toLocaleString() ?? "?"}</strong>
            </div>
            <div className="stat-chip">
              <span>Output</span>
              <strong>{usage.outputTokens?.toLocaleString() ?? "?"}</strong>
            </div>
          </div>
        )}

        {hasDocument && (
          <>
            <div className="deliverables">
              <button className="btn primary" onClick={downloadPdf} type="button">
                <SheetIcon />
                Download PDF
              </button>

              <button className="btn" onClick={downloadTex} type="button">
                <CodeIcon />
                .tex file
              </button>

              <button className="btn" onClick={() => void copyLatex()} type="button">
                <CopyIcon />
                Copy LaTeX
              </button>
            </div>

            <p className="input-hint">
              The PDF opens your browser's print dialog — pick{" "}
              <strong>Save as PDF</strong> to keep the text selectable and the
              maths sharp.
            </p>

            <label className="switch">
              <input
                type="checkbox"
                checked={attachScans}
                onChange={(event) => setAttachScans(event.target.checked)}
              />
              <span>Attach the original photos after the typed pages</span>
            </label>
          </>
        )}
      </aside>
    </section>
  );
}
