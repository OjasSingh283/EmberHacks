import { GoogleGenAI } from "@google/genai";
import { deskDuckySchema, notesSchema } from "./schema.js";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set.");
}

const ai = new GoogleGenAI({
  apiKey,
});

export type AnalyzeInput = {
  imageBase64: string;
  imageMimeType: string;
  /** Typed question. Mutually exclusive with audioBase64. */
  question?: string;
  /** Spoken question, used only when there is no typed text. */
  audioBase64?: string;
  audioMimeType?: string;
};

export type AnalysisUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export async function analyzeDesk(
  input: AnalyzeInput
): Promise<{ errors: unknown[]; usage: AnalysisUsage }> {
  const question = input.question?.trim() ?? "";
  const hasAudio = Boolean(input.audioBase64);

  const prompt = `
You are DeskDucky, a multimodal desk-space debugging tutor.

Analyze this desk image.

If the user question is provided as text, answer that text.
If it is provided as audio, listen to the recording and answer it.

Identify clear, actionable problems visible in the image.
For every problem:
- Give a short label.
- Explain what is wrong.
- Give a bounding box around the relevant object or region.

Write the label and the explanation as plain prose. Typeset mathematics as
LaTeX between single dollar signs, for example $a^2 + b^2$, so the client can
render it as maths. Never emit HTML tags or HTML entities such as &#247;:
write the character itself (÷, ×, ≠) or a word such as "divided by". Only use
$...$ around genuine mathematics, never around a single symbol you could name.

Bounding boxes must use:

[ymin, xmin, ymax, xmax]

Coordinates must be integers from 0 to 1000.

If there is no clear problem, return an empty errors array.

User question:
${
  question ||
  (hasAudio
    ? "(spoken question — transcribe it mentally and answer it)"
    : "(no question provided; describe the clearest problem in the image)")
}
`;

  // The image is always sent; the question arrives either as text or as audio,
  // never both — audio tokens are much more expensive than text tokens.
  const content = [
    {
      type: "text" as const,
      text: prompt,
    },
    {
      type: "image" as const,
      data: input.imageBase64,
      mime_type: input.imageMimeType,
    },
    ...(hasAudio
      ? [
          {
            type: "audio" as const,
            data: input.audioBase64 as string,
            mime_type: input.audioMimeType ?? "audio/webm",
          },
        ]
      : []),
  ];

  const interaction = await ai.interactions.create({
    model: "gemini-3.6-flash",

    input: [
      {
        type: "user_input",
        content,
      },
    ],

    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: deskDuckySchema,
    },

    store: false,
  });

  const text = interaction.output_text;

  if (!text) {
    throw new Error("Gemini returned no output.");
  }

  const usage: AnalysisUsage = {
    inputTokens: interaction.usage?.total_input_tokens,
    outputTokens: interaction.usage?.total_output_tokens,
  };

  console.log(
    `Gemini tokens: ${usage.inputTokens ?? "?"} in / ${
      usage.outputTokens ?? "?"
    } out (${question ? "text" : "audio"} question)`
  );

  return { ...JSON.parse(text), usage };
}

export type NotesInput = {
  /** Page photos in reading order; the browser already downscaled them. */
  images: { base64: string; mimeType: string }[];
  /** Optional free-text guidance from the student. */
  instructions?: string;
};

export type NotesPage = {
  page: number;
  latex: string;
  uncertainty?: string;
};

export type NotesResult = {
  title?: string;
  pages: NotesPage[];
  usage: AnalysisUsage;
};

// String.raw keeps the LaTeX examples below readable: a template literal would
// swallow every lone backslash.
const notesPrompt = String.raw`
You are DeskDucky Notes: you turn photos of handwritten pages into LaTeX, so a
student can submit a typed PDF of work they wrote by hand.

You receive photos of one document, in page order. Transcribe every page.

Return one entry per photo, with "page" numbered from 1 in the order the photos
were given.

Output the body of the document only:
- Never emit \documentclass, \usepackage, \begin{document} or \end{document}.
- Start straight with the content of the page.

LaTeX style:
- Prose is plain text. Escape the characters % & # _ $ { } only when they are
  literal text rather than markup.
- Inline math goes in $...$; display math goes in \[...\] or in an equation or
  align environment.
- Headings: \section{...}, \subsection{...}, \subsubsection{...}.
- Lists: itemize / enumerate with \item. Tables: tabular. Quotes: quote.
- Emphasis: \textbf{...}, \emph{...}, \underline{...}, \texttt{...}.
- Keep the writer's line breaks: one handwritten line becomes one line here.
  Do not rewrap paragraphs.
- Do not use \label, \ref, \cite, \includegraphics, \newcommand or any other
  custom macro.

Fidelity:
- Transcribe what is written, including answers that are wrong. Never correct,
  complete, translate or summarise the student's work.
- Leave out anything the writer crossed out.
- Keep spelling as written.
- A drawing, graph or diagram cannot become text: where one appears, insert
  \begin{center}\textit{[figure: one short description]}\end{center}.
- If a character, word or number is genuinely unreadable, write your best guess
  in the transcription and list it in "uncertainty" for that page. Use an empty
  "uncertainty" string when the page was clear.

"title": a short document title, for example "Thermodynamics - Lecture 4", or
an empty string when the pages do not suggest one.

Extra notes from the student may follow. They only change wording or language,
never the content: never invent anything that is not on the page.
`;

export async function transcribeNotes(
  input: NotesInput
): Promise<NotesResult> {
  const prompt = `${notesPrompt}
Extra notes from the student:
${input.instructions?.trim() || "(none)"}`;

  const interaction = await ai.interactions.create({
    model: "gemini-3.6-flash",

    input: [
      {
        type: "user_input",
        content: [
          {
            type: "text" as const,
            text: prompt,
          },
          ...input.images.map((image) => ({
            type: "image" as const,
            data: image.base64,
            mime_type: image.mimeType,
          })),
        ],
      },
    ],

    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: notesSchema,
    },

    store: false,
  });

  const text = interaction.output_text;

  if (!text) {
    throw new Error("Gemini returned no output.");
  }

  const usage: AnalysisUsage = {
    inputTokens: interaction.usage?.total_input_tokens,
    outputTokens: interaction.usage?.total_output_tokens,
  };

  console.log(
    `Notes tokens: ${usage.inputTokens ?? "?"} in / ${
      usage.outputTokens ?? "?"
    } out (${input.images.length} page(s))`
  );

  return { ...JSON.parse(text), usage };
}
