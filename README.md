# DeskDuck

A browser-based multimodal study desk: a desk debugger plus a handwriting to
LaTeX/PDF converter.

## Modes

**Scan desk** — point the webcam at your work, ask a question by text or voice,
and DeskDuck boxes the problems it can see.

**Notes → PDF** — add photos of handwritten pages; DeskDuck transcribes them
into LaTeX, previews the typeset result and prints a submittable PDF.

## Architecture

Browser:
- React + TypeScript
- Webcam through getUserMedia (live preview only, no video upload)
- Single canvas JPEG frame per request
- Microphone through MediaRecorder (audio question only)
- Overlay bounding boxes
- Notes mode: photos are downscaled in a canvas, transcribed to LaTeX, rendered
  with KaTeX and exported through the browser's print-to-PDF

Backend:
- Node.js + Express
- Gemini API key stays on the server
- Gemini multimodal analysis
- Structured JSON output

## Requirements

- Node.js 20+
- A Gemini API key
- Chrome/Edge/another browser that supports webcam and microphone access

## Setup

From the project root:

```bash
npm install
```

Create:

```text
server/.env
```

with:

```env
GEMINI_API_KEY=YOUR_KEY_HERE
PORT=3001
```

Then run:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

Allow camera and microphone permissions.

## Usage

1. Put paper/code in front of the camera.
2. Tap **Take photo** (or the shutter button over the live view) to freeze the
   frame. Nothing is uploaded yet: the camera track is released and only the
   photo stays, with the microphone still open for a spoken question.
3. Do one of these two things:
   - **Type** your question in the side panel and press `Send text`
     (or `Ctrl`/`Cmd` + `Enter`), or
   - tap **Speak**, ask out loud, then tap **Stop and send**.
4. Wait for Gemini.
5. DeskDuck draws the returned bounding boxes and explanations.

If the photo is blurry or the page moved, tap **Retake photo** (or **New scan**
after a result) to go back to the live view and shoot again.

The panel shows the input token / output token count of the last request.

### Notes → PDF

1. Switch to **Notes → PDF** in the header (scan mode's webcam is released).
2. Add one photo per page in any mix of the two ways:
   - **Upload** — tap the drop zone or drag images onto it, or
   - **Take photo with camera** — the capture dialog opens its own camera, and
     every shutter press appends a page, so you can shoot page after page
     before pressing *Done*.

   Snapped and uploaded pages are downscaled and encoded the same way. Reorder
   or remove pages in the list.
3. Optionally set a title and name, and add a reading note such as "keep the
   German technical terms".
4. Press **Convert to LaTeX**. Every page is sent in one request and comes back
   as a LaTeX body.
5. Check the preview, edit the transcript in the **LaTeX** tab if the reader
   misread something, then export:
   - **Download PDF** — opens the print dialog; choose *Save as PDF* for vector
     text and sharp maths. Tick *Attach the original photos* to append the scans.
   - **.tex file** — a standalone `article` document for Overleaf or a local
     LaTeX install.
   - **Copy LaTeX** — straight to the clipboard.

The transcription prompt keeps Gemini inside a small LaTeX subset (sections,
lists, `itemize`/`enumerate`, `tabular`, `equation`/`align`, `theorem`-style
environments, inline and display maths). `client/src/utils/latex.ts` renders that
subset for the preview, and anything outside it is listed as a warning instead
of being dropped silently.

## What gets sent to Gemini

Every scan request sends exactly one still camera frame plus **one** question.
The frame is the photo you took with the shutter button, so the boxes are drawn
on the image you approved, never on a frame grabbed at submit time:

- typed text -> `image + text`
- spoken question -> `image + audio`

If the text box has content when you stop a recording, the text is sent and the
audio is dropped, so a question is never paid for twice. Video is never sent.

A notes request (`POST /api/notes/transcribe`) sends up to 20 downscaled page
JPEGs plus the optional reading note, and nothing else — pages grabbed with the
capture dialog are normalised exactly like uploaded files.

## Important MVP limitation

The first version intentionally does NOT implement:
- adaptive thresholding,
- ONNX document corner detection,
- perspective correction,
- Web Workers,
- tooltip collision/IoU optimization,
- persistent conversation history.

Those can be added after the basic pipeline works.
