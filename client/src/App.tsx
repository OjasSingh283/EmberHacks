import { useEffect, useRef, useState } from "react";
import CameraView from "./components/CameraView";
import FluidBackground from "./components/FluidBackground";
import NotesStudio from "./components/NotesStudio";
import {
  AnalysisResult,
  AnalysisUsage,
  DeskDuckError
} from "./types";
import {
  blobToBase64,
  dataUrlToBase64,
  getSupportedRecorderMimeType
} from "./utils/media";
import { captureFrame } from "./utils/capture";

type RequestPayload = {
  question?: string;
  audioBase64?: string;
  audioMimeType?: string;
};

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 12 20 4l-4 16-4-6-8-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect
        x="9"
        y="3"
        width="6"
        height="11"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DuckIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden>
      <circle cx="21" cy="10" r="5.6" fill="currentColor" />
      <path d="M24.6 8.4 31.4 10.1 24.6 11.9Z" fill="currentColor" />
      <ellipse cx="12.6" cy="19.8" rx="9.6" ry="6.6" fill="currentColor" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
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

function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
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

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingMimeTypeRef = useRef("audio/webm");

  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [errors, setErrors] = useState<DeskDuckError[]>([]);
  const [usage, setUsage] = useState<AnalysisUsage | null>(null);
  const [status, setStatus] = useState("Starting camera...");
  const [question, setQuestion] = useState("");
  const [lastInput, setLastInput] = useState("");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [mode, setMode] = useState<"scan" | "notes">("scan");
  const [showComments, setShowComments] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof localStorage === "undefined") return "dark";
    return localStorage.getItem("deskduck-theme") === "light" ? "light" : "dark";
  });

  useEffect(() => {
    startCamera();

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("deskduck-theme", theme);
  }, [theme]);

  // The webcam is only needed for desk scanning; notes mode uploads files.
  const previousMode = useRef(mode);

  useEffect(() => {
    const changed = previousMode.current !== mode;
    previousMode.current = mode;

    if (!changed) return;

    if (mode === "notes") {
      stopCamera();
      setStatus("Notes mode — add photos of your handwritten pages.");
      return;
    }

    if (!capturedImage) {
      setStatus("Starting camera...");
      void startCamera();
    }
  }, [mode]);

  async function startCamera() {
    try {
      setCapturedImage(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        },
        audio: true
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraReady(true);
      setStatus("Ready — type a question or tap the mic.");
    } catch (error) {
      console.error(error);
      setStatus(
        "Camera/microphone permission failed. Allow permissions and reload."
      );
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraReady(false);
  }

  function submitText() {
    const text = question.trim();

    if (!text || !cameraReady || analyzing) return;

    setQuestion("");
    setLastInput(`Text — ${text}`);
    void runAnalysis({ question: text });
  }

  function startRecording() {
    const stream = streamRef.current;

    if (!stream) return;

    const audioTracks = stream.getAudioTracks();

    if (audioTracks.length === 0) {
      setStatus("No microphone track is available.");
      return;
    }

    const audioStream = new MediaStream(audioTracks);
    const mimeType = getSupportedRecorderMimeType();

    try {
      const recorder = mimeType
        ? new MediaRecorder(audioStream, { mimeType })
        : new MediaRecorder(audioStream);

      recordingMimeTypeRef.current =
        recorder.mimeType || mimeType || "audio/webm";
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(100);
      recorderRef.current = recorder;

      setRecording(true);
      setErrors([]);
      setUsage(null);
      setStatus("Listening — tap stop when you finish.");
    } catch (error) {
      console.error(error);
      setStatus("Could not start microphone recording.");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;

    if (!recorder) return;

    setRecording(false);
    recorderRef.current = null;

    recorder.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recordingMimeTypeRef.current
        });

        // Anything typed in the box wins: image + text is sent and the audio
        // recording is dropped so a question is never paid for twice.
        const text = question.trim();

        if (text) {
          setQuestion("");
          setLastInput(`Text — ${text}`);
          await runAnalysis({ question: text });
          return;
        }

        if (audioBlob.size === 0) {
          setStatus("No audio was captured — type your question instead.");
          return;
        }

        const audioBase64 = await blobToBase64(audioBlob);

        setLastInput("Voice question");
        await runAnalysis({
          audioBase64,
          audioMimeType: recordingMimeTypeRef.current
        });
      } catch (error) {
        console.error(error);
        setAnalyzing(false);
        setStatus(error instanceof Error ? error.message : "Analysis failed.");
      }
    };

    setStatus("Analyzing your desk...");
    recorder.stop();
  }

  function toggleRecording() {
    if (!cameraReady || analyzing) return;

    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  async function runAnalysis(payload: RequestPayload) {
    const video = videoRef.current;

    if (!video) {
      setStatus("The camera is not ready yet.");
      return;
    }

    setAnalyzing(true);
    setErrors([]);
    setUsage(null);
    setActiveIndex(null);
    setStatus("Analyzing your desk...");

    // Capture the frame at submit time: a single JPEG, never a video clip.
    let imageDataUrl: string;

    try {
      imageDataUrl = captureFrame(video);
    } catch (error) {
      console.error(error);
      setAnalyzing(false);
      setStatus("Could not capture the camera frame.");
      return;
    }

    // The photo has been taken: freeze it on screen and shut the camera down
    // so the results are annotated on the exact image that was sent.
    setCapturedImage(imageDataUrl);
    stopCamera();

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          imageBase64: dataUrlToBase64(imageDataUrl),
          imageMimeType: "image/jpeg",
          ...payload
        })
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Backend analysis failed.");
      }

      const result = body as AnalysisResult;

      setErrors(result.errors ?? []);
      setUsage(result.usage ?? null);
      setStatus(
        result.errors?.length
          ? `${result.errors.length} issue(s) found.`
          : "No specific error found."
      );
    } catch (error) {
      console.error(error);
      setErrors([]);
      setStatus(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  function startNewScan() {
    setErrors([]);
    setUsage(null);
    setLastInput("");
    setCapturedImage(null);
    setShowComments(true);
    setActiveIndex(null);
    void startCamera();
  }

  const ready = cameraReady && !analyzing;

  return (
    <main className="app">
      <FluidBackground theme={theme} />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <DuckIcon />
          </div>
          <div>
            <p className="eyebrow">Multimodal study desk</p>
            <h1>
              Desk<span>Duck</span>
            </h1>
          </div>
        </div>

        <div className="mode-switch" role="tablist" aria-label="DeskDuck mode">
          <button
            className={`mode-tab ${mode === "scan" ? "active" : ""}`}
            onClick={() => setMode("scan")}
            role="tab"
            aria-selected={mode === "scan"}
            type="button"
          >
            <ScanIcon />
            Scan desk
          </button>

          <button
            className={`mode-tab ${mode === "notes" ? "active" : ""}`}
            onClick={() => setMode("notes")}
            role="tab"
            aria-selected={mode === "notes"}
            type="button"
          >
            <SheetIcon />
            Notes → PDF
          </button>
        </div>

        <div className="topbar-right">
          <button
            className="theme-toggle"
            onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            type="button"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          {mode === "scan" && errors.length > 0 && (
            <span className="count-badge">
              <span className="count-num">{errors.length}</span>
              {errors.length === 1 ? "issue" : "issues"}
            </span>
          )}

          <div
            className={`status ${recording ? "recording" : ""} ${
              analyzing ? "busy" : ""
            }`}
          >
            <span className="status-dot" />
            {recording ? "RECORDING" : analyzing ? "ANALYZING" : status}
          </div>
        </div>
      </header>

      <p className="subtitle">
        {mode === "scan"
          ? "Show your paper, then type or say what looks wrong — DeskDuck sends one camera frame with your question."
          : "Photograph your handwritten pages and DeskDuck typesets them into a LaTeX PDF you can hand in."}
      </p>

      {mode === "scan" ? (
      <section className="workspace">
        <CameraView
          videoRef={videoRef}
          errors={errors}
          imageSrc={capturedImage}
          showComments={showComments}
          activeIndex={activeIndex}
          analyzing={analyzing}
          lastInput={lastInput}
          onToggleComments={() => setShowComments((value) => !value)}
          onScanAgain={startNewScan}
        />

        <aside className="panel">
          <div className="panel-head">
            <h2>Ask about your desk</h2>
            <SparkIcon />
          </div>

          <p className="hint">
            Write a question and press <strong>Send text</strong>, or tap{" "}
            <strong>Speak</strong> and talk. Typing costs far fewer tokens than
            talking, so text wins if you do both.
          </p>

          <textarea
            className="question-input"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submitText();
              }
            }}
            placeholder='Try: "Where did my induction step go wrong?"'
            rows={4}
            disabled={!ready}
          />

          <div className="input-hint">
            <kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to send
          </div>

          <div className="input-actions">
            <button
              className="btn primary"
              onClick={submitText}
              disabled={!ready || !question.trim()}
              type="button"
            >
              <SendIcon />
              Send text
            </button>

            <button
              className={`btn mic ${recording ? "recording" : ""}`}
              onClick={toggleRecording}
              disabled={!ready}
              aria-pressed={recording}
              type="button"
            >
              <MicIcon />
              {recording ? "Stop & send" : "Speak"}
            </button>
          </div>

          <div className="question-card">
            <span>SENT</span>
            <p>
              {lastInput || "Camera frame + either your typed text or your voice."}
            </p>
          </div>

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

          {analyzing && (
            <div className="loading">
              <div className="spinner" />
              Gemini is examining the image and question...
            </div>
          )}

          {!analyzing && errors.length === 0 && capturedImage && (
            <div className="all-clear">
              <div className="all-clear-mark">✓</div>
              <div>
                <strong>Nothing flagged</strong>
                <span>No obvious mistakes were found in this frame.</span>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="results">
              <div className="results-head">
                <span>Findings</span>
                <span className="results-count">{errors.length}</span>
              </div>

              <ul className="results-list">
                {errors.map((error, index) => (
                  <li key={`${error.label}-${index}`}>
                    <button
                      type="button"
                      className={`result-card ${
                        activeIndex === index ? "active" : ""
                      }`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseLeave={() => setActiveIndex(null)}
                      onFocus={() => setActiveIndex(index)}
                      onBlur={() => setActiveIndex(null)}
                      onClick={() => setActiveIndex(index)}
                    >
                      <span className="result-num">{index + 1}</span>
                      <span className="result-text">
                        <strong>{error.label}</strong>
                        <span>{error.explanation}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {capturedImage && (
            <button
              className="btn ghost"
              onClick={startNewScan}
              disabled={analyzing}
              type="button"
            >
              New scan
            </button>
          )}
        </aside>
      </section>
      ) : (
        <NotesStudio onStatus={setStatus} />
      )}

      <footer className="footer">
        <span>DeskDuck</span>
        <span className="footer-dot" />
        <span>One frame, one question, no video stored.</span>
      </footer>
    </main>
  );
}
