import { RefObject } from "react";
import { DeskDuckyError } from "../types";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  errors: DeskDuckyError[];
  imageSrc: string | null;
  showComments: boolean;
  activeIndex: number | null;
  analyzing: boolean;
  lastInput: string;
  onToggleComments: () => void;
  onScanAgain: () => void;
  onTakePhoto: () => void;
  canTakePhoto: boolean;
};

export default function CameraView({
  videoRef,
  errors,
  imageSrc,
  showComments,
  activeIndex,
  analyzing,
  lastInput,
  onToggleComments,
  onScanAgain,
  onTakePhoto,
  canTakePhoto
}: Props) {
  return (
    <div className="viewer">
      <video
        ref={videoRef}
        className={`camera live ${imageSrc ? "hidden" : ""}`}
        autoPlay
        playsInline
        muted
      />

      {imageSrc && (
        <img
          className="camera frozen"
          src={imageSrc}
          alt="Captured desk frame"
        />
      )}

      <div className={`viewer-badge ${imageSrc ? "frozen" : "live"}`}>
        <span className="badge-dot" />
        {imageSrc ? "FROZEN FRAME" : "LIVE"}
      </div>

      {analyzing && (
        <div className="scanline" aria-hidden>
          <div className="scanline-bar" />
        </div>
      )}

      {!imageSrc && (
        <div className="viewer-empty">
          <div className="empty-ring">
            <span />
          </div>
          <p>Center your page in the frame</p>
          <span>Then take a photo and ask your question.</span>
        </div>
      )}

      {!imageSrc && (
        <button
          className="shutter"
          onClick={onTakePhoto}
          disabled={!canTakePhoto}
          type="button"
        >
          <span className="shutter-ring" aria-hidden />
          Take photo
        </button>
      )}

      {imageSrc && (
        <div className="viewer-toolbar">
          {errors.length > 0 && (
            <button
              className="tool"
              onClick={onToggleComments}
              aria-pressed={!showComments}
              type="button"
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="2.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
              {showComments ? "Hide marks" : "Show marks"}
            </button>
          )}

          <button
            className="tool accent"
            onClick={onScanAgain}
            disabled={analyzing}
            type="button"
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path
                d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {lastInput ? "New scan" : "Retake photo"}
          </button>
        </div>
      )}

      {imageSrc && lastInput && (
        <div className="viewer-chip">
          <span>ASKED</span>
          <p>{lastInput}</p>
        </div>
      )}

      <div className={`overlay ${showComments ? "" : "hidden"}`}>
        {errors.map((error, index) => {
          const [ymin, xmin, ymax, xmax] = error.box_2d;
          const active = index === activeIndex;

          // The frozen image is shown in its true orientation, so the AI's
          // coordinates map straight onto the displayed pixels.
          const left = `${(xmin / 1000) * 100}%`;
          const top = `${(ymin / 1000) * 100}%`;
          const width = `${((xmax - xmin) / 1000) * 100}%`;
          const height = `${((ymax - ymin) / 1000) * 100}%`;

          return (
            <div key={`${error.label}-${index}`}>
              <div
                className={`error-box ${active ? "active" : ""}`}
                style={{ left, top, width, height }}
              >
                <span className="box-num">{index + 1}</span>
              </div>

              <div
                className={`tooltip ${active ? "active" : ""}`}
                style={{
                  left,
                  top: `${Math.min(92, (ymin / 1000) * 100)}%`
                }}
              >
                <strong>{error.label}</strong>
                <span>{error.explanation}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
