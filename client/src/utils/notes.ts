/** Wraps the transcribed body in a standalone document you can compile anywhere. */
export function buildLatexDocument(options: {
  title: string;
  author: string;
  body: string;
}): string {
  const title = options.title.trim();
  const author = options.author.trim();

  const preamble = [
    "\\documentclass[11pt]{article}",
    "\\usepackage[a4paper,margin=1in]{geometry}",
    "\\usepackage{amsmath,amssymb,amsfonts}",
    "\\usepackage{graphicx}",
    "\\usepackage{enumitem}",
    "\\usepackage[T1]{fontenc}",
    "\\usepackage[utf8]{inputenc}",
    "\\setlength{\\parindent}{0pt}",
    "\\setlength{\\parskip}{8pt}",
    "",
    ...(title ? [`\\title{${escapeLatexText(title)}}`] : []),
    ...(author ? [`\\author{${escapeLatexText(author)}}`] : []),
    "\\date{\\today}"
  ];

  const open = [
    "\\begin{document}",
    ...(title || author ? ["\\maketitle"] : [])
  ];

  return [
    ...preamble,
    "",
    ...open,
    "",
    options.body.trim(),
    "",
    "\\end{document}",
    ""
  ].join("\n");
}

/** Escapes the characters that would otherwise break the title or author line. */
export function escapeLatexText(text: string): string {
  // Typographic characters from a paste would need extra packages to compile.
  const ascii = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/\u2014/g, "---")
    .replace(/\u2013/g, "--")
    .replace(/\u2026/g, "...");

  return ascii.replace(/[\\{}#$%&_^~]/g, (char) => {
    if (char === "^") return "\\textasciicircum{}";
    if (char === "~") return "\\textasciitilde{}";
    return `\\${char}`;
  });
}

export function slugify(text: string, fallback = "deskduck-notes"): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || fallback;
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoke on the next tick so the download has started.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatToday(): string {
  return new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}
