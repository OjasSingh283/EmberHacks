import "dotenv/config";
import express from "express";
import cors from "cors";
import { analyzeDesk, transcribeNotes } from "./gemini.js";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/analyze", async (req, res) => {
  try {
    const {
      imageBase64,
      imageMimeType,
      question,
      audioBase64,
      audioMimeType
    } = req.body ?? {};

    const hasQuestion =
      typeof question === "string" && question.trim().length > 0;
    const hasAudio =
      typeof audioBase64 === "string" && audioBase64.length > 0;

    if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
      res.status(400).json({
        error: "imageBase64 is required."
      });
      return;
    }

    if (!hasQuestion && !hasAudio) {
      res.status(400).json({
        error: "Send either question text or audioBase64."
      });
      return;
    }

    // If the user typed something, send the text and drop the audio: the same
    // question costs far fewer tokens as text than as a recording.
    const includeAudio = !hasQuestion && hasAudio;

    const result = await analyzeDesk({
      imageBase64,
      imageMimeType:
        typeof imageMimeType === "string"
          ? imageMimeType
          : "image/jpeg",
      question: hasQuestion ? question.trim() : undefined,
      audioBase64: includeAudio ? audioBase64 : undefined,
      audioMimeType: includeAudio
        ? typeof audioMimeType === "string"
          ? audioMimeType
          : "audio/webm"
        : undefined
    });

    res.json(result);
  } catch (error) {
    console.error("Analysis error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown server error.";

    res.status(500).json({
      error: message
    });
  }
});

const MAX_NOTE_PAGES = 20;

/** Notes mode: photos of handwritten pages in, LaTeX per page out. */
app.post("/api/notes/transcribe", async (req, res) => {
  try {
    const { pages, instructions } = req.body ?? {};

    if (!Array.isArray(pages) || pages.length === 0) {
      res.status(400).json({ error: "pages must be a non-empty array." });
      return;
    }

    if (pages.length > MAX_NOTE_PAGES) {
      res.status(400).json({
        error: `Too many photos: send at most ${MAX_NOTE_PAGES} per document.`
      });
      return;
    }

    const images = pages.map((page: unknown, index: number) => {
      const candidate = (page ?? {}) as {
        imageBase64?: unknown;
        imageMimeType?: unknown;
      };

      if (
        typeof candidate.imageBase64 !== "string" ||
        candidate.imageBase64.length === 0
      ) {
        throw new Error(`Photo ${index + 1} is missing imageBase64.`);
      }

      return {
        base64: candidate.imageBase64,
        mimeType:
          typeof candidate.imageMimeType === "string"
            ? candidate.imageMimeType
            : "image/jpeg"
      };
    });

    const result = await transcribeNotes({
      images,
      instructions:
        typeof instructions === "string" ? instructions : undefined
    });

    res.json(result);
  } catch (error) {
    console.error("Notes error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown server error.";

    res.status(500).json({
      error: message
    });
  }
});

app.listen(port, () => {
  console.log(`DeskDuck backend running on http://localhost:${port}`);
});