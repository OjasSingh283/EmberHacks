import katex from "katex";

/**
 * A deliberately small LaTeX body renderer.
 *
 * Gemini is instructed to stay inside a documented subset of LaTeX, so this
 * walks the source, hands every piece of math to KaTeX, and maps the handful of
 * structural environments we ask for onto HTML. Anything it does not recognise
 * is reported back as a warning instead of silently vanishing.
 */
export type RenderedLatex = {
  html: string;
  warnings: string[];
};

type Segment =
  | { kind: "text"; text: string }
  | { kind: "math"; tex: string }
  | { kind: "env"; name: string; content: string };

const LIST_ENVS: Record<string, string> = {
  itemize: "ul",
  enumerate: "ol"
};

const THEOREM_ENVS: Record<string, string> = {
  theorem: "Theorem",
  lemma: "Lemma",
  corollary: "Corollary",
  proposition: "Proposition",
  claim: "Claim",
  definition: "Definition",
  example: "Example",
  remark: "Remark",
  note: "Note",
  proof: "Proof",
  solution: "Solution",
  exercise: "Exercise",
  problem: "Problem"
};

const PLAIN_ENVS: Record<string, string> = {
  quote: "quote",
  quotation: "quote",
  verse: "quote",
  center: "center",
  flushleft: "center",
  flushright: "center",
  abstract: "abstract",
  figure: "figure",
  table: "figure"
};

const MATH_ENVS = new Set([
  "equation",
  "equation*",
  "align",
  "align*",
  "alignat",
  "alignat*",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "eqnarray",
  "eqnarray*",
  "displaymath",
  "split",
  "aligned",
  "gathered",
  "cases",
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
  "smallmatrix",
  "array"
]);

const WRAPPERS: Record<string, string> = {
  textbf: "strong",
  mathbf: "strong",
  textit: "em",
  emph: "em",
  textsl: "em",
  underline: "u",
  uline: "u",
  texttt: "code",
  url: "code",
  textsc: "span.tex-caps",
  textsf: "span.tex-sans",
  textrm: "span",
  textnormal: "span",
  text: "span",
  mathrm: "span",
  mbox: "span",
  hbox: "span",
  hl: "mark",
  footnote: "span.tex-note",
  caption: "span.tex-caption"
};

/** Commands that take two arguments and keep only the text one. */
const TWO_ARG_KEEP_LAST = new Set(["textcolor", "colorbox", "fcolorbox", "href"]);

const ESCAPED: Record<string, string> = {
  "%": "%",
  "&": "&",
  "#": "#",
  _: "_",
  $: "$",
  "{": "{",
  "}": "}",
  "~": "\u00a0",
  "^": "^"
};

const SPACING: Record<string, string> = {
  quad: "\u2003\u2003",
  qquad: "\u2003\u2003\u2003\u2003",
  thinspace: "\u2009",
  enskip: "\u2002",
  ens: "\u2002",
  medspace: "\u2005",
  thickspace: "\u2005\u2005",
  space: " ",
  hfill: " ",
  hfil: "",
  smallskip: "",
  medskip: "",
  bigskip: ""
};

const DROPPED = new Set([
  "label",
  "ref",
  "eqref",
  "pageref",
  "cite",
  "citet",
  "citep",
  "index",
  "nonumber",
  "notag",
  "hline",
  "toprule",
  "midrule",
  "bottomrule",
  "cline",
  "centering",
  "raggedright",
  "raggedleft",
  "noindent",
  "indent",
  "newpage",
  "clearpage",
  "pagebreak",
  "linebreak",
  "nolinebreak",
  "allowbreak",
  "newline",
  "relax",
  "displaystyle",
  "textstyle",
  "limits",
  "nolimits",
  "item",
  "hspace",
  "vspace",
  "hskip",
  "vskip",
  "phantom",
  "strut",
  "vfill",
  "par",
  "maketitle"
]);

const PREAMBLE_PATTERNS = [
  /\\documentclass(\[[^\]]*\])?\{[^}]*\}/g,
  /\\usepackage(\[[^\]]*\])?\{[^}]*\}/g,
  /\\begin\{document\}/g,
  /\\end\{document\}/g,
  /\\title\{[^}]*\}/g,
  /\\author\{[^}]*\}/g,
  /\\date\{[^}]*\}/g
];

export function renderLatex(body: string): RenderedLatex {
  const warnings: string[] = [];
  const source = stripPreamble(stripComments(body));
  const html = splitSegments(source)
    .map((segment) => renderSegment(segment, warnings))
    .join("\n");

  return { html, warnings: Array.from(new Set(warnings)) };
}

/* ---------- source cleanup ---------- */

function stripComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      let out = "";

      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];

        if (char === "\\") {
          out += char + (line[i + 1] ?? "");
          i += 1;
          continue;
        }

        if (char === "%") break;

        out += char;
      }

      return out;
    })
    .join("\n");
}

function stripPreamble(source: string): string {
  return PREAMBLE_PATTERNS.reduce(
    (result, pattern) => result.replace(pattern, ""),
    source
  );
}

/* ---------- segmentation ---------- */

function findEnvEnd(source: string, from: number, name: string): number {
  const open = "\\begin{" + name + "}";
  const close = "\\end{" + name + "}";
  let depth = 0;
  let i = from;

  while (i < source.length) {
    if (source.startsWith(open, i)) {
      depth += 1;
      i += open.length;
      continue;
    }

    if (source.startsWith(close, i)) {
      depth -= 1;

      if (depth === 0) return i;

      i += close.length;
      continue;
    }

    i += 1;
  }

  return -1;
}

function splitSegments(source: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /\\begin\{([A-Za-z*]+)\}/g;
  let text = "";
  let i = 0;

  const flushText = () => {
    for (const chunk of text.split(/\n[ \t]*\n+/)) {
      const trimmed = chunk.trim();

      if (trimmed) segments.push({ kind: "text", text: trimmed });
    }

    text = "";
  };

  while (i < source.length) {
    pattern.lastIndex = i;
    const match = pattern.exec(source);

    if (!match) {
      text += source.slice(i);
      break;
    }

    const name = match[1];
    const start = match.index;
    const known =
      Boolean(LIST_ENVS[name]) ||
      name === "description" ||
      Boolean(THEOREM_ENVS[name]) ||
      Boolean(PLAIN_ENVS[name]) ||
      MATH_ENVS.has(name) ||
      name === "tabular";

    if (!known) {
      // Unknown environment: keep it as text so the inline renderer reports it.
      text += source.slice(i, start + match[0].length);
      i = start + match[0].length;
      continue;
    }

    const end = findEnvEnd(source, start, name);
    const contentEnd = end === -1 ? source.length : end;
    const inner = source.slice(start + match[0].length, contentEnd);

    text += source.slice(i, start);
    flushText();

    if (MATH_ENVS.has(name)) {
      segments.push({
        kind: "math",
        tex: source.slice(start, contentEnd) + (end === -1 ? "" : "\\end{" + name + "}")
      });
    } else {
      segments.push({ kind: "env", name, content: inner });
    }

    i = end === -1 ? source.length : end + ("\\end{" + name + "}").length;
  }

  flushText();

  return segments;
}

/* ---------- blocks ---------- */

function renderBlocks(source: string, warnings: string[]): string {
  return splitSegments(source)
    .map((segment) => renderSegment(segment, warnings))
    .join("\n");
}

function renderSegment(segment: Segment, warnings: string[]): string {
  if (segment.kind === "math") return wrapDisplay(segment.tex, warnings);

  if (segment.kind === "env") {
    return renderEnv(segment.name, segment.content, warnings);
  }

  return renderText(segment.text, warnings);
}

function renderText(text: string, warnings: string[]): string {
  const body = text.replace(/^\\item\b\s*/, "");

  const doubled = /^\$\$([\s\S]+)\$\$$/.exec(body);
  if (doubled) return wrapDisplay(doubled[1], warnings);

  const bracketed = /^\\\[([\s\S]+)\\\]$/.exec(body);
  if (bracketed) return wrapDisplay(bracketed[1], warnings);

  // A heading can be followed by prose inside the same paragraph, so the
  // command is read with a group parser rather than matched to the end.
  const heading =
    /^\\(chapter|section|subsection|subsubsection|paragraph)\*?\s*\{/.exec(body);

  if (heading) {
    const group = readGroup(body, heading[0].length - 1);

    if (group) {
      const command = heading[1];
      const level =
        command === "section" || command === "chapter"
          ? 2
          : command === "subsection"
            ? 3
            : 4;
      const rest = body.slice(group.end).trim();
      const html = `<h${level} class="tex-h tex-h${level}">${renderInline(
        group.value,
        warnings
      )}</h${level}>`;

      return rest ? `${html}\n<p>${renderInline(rest, warnings)}</p>` : html;
    }
  }

  return `<p>${renderInline(body, warnings)}</p>`;
}

function renderEnv(name: string, content: string, warnings: string[]): string {
  const listTag = LIST_ENVS[name];

  if (listTag) {
    const items = splitItems(content);

    if (!items.length) return "";

    const rendered = items
      .map((item) => `<li>${renderBlocks(item, warnings)}</li>`)
      .join("");

    return `<${listTag} class="tex-list">${rendered}</${listTag}>`;
  }

  if (name === "description") {
    const rows = splitItems(content).map((item) => {
      const match = /^\[([^\]]*)\]\s*([\s\S]*)$/.exec(item.trim());
      const term = match ? match[1] : "";
      const rest = match ? match[2] : item;

      return `<dt>${renderInline(term, warnings)}</dt><dd>${renderBlocks(
        rest,
        warnings
      )}</dd>`;
    });

    return `<dl class="tex-list tex-desc">${rows.join("")}</dl>`;
  }

  const theorem = THEOREM_ENVS[name];

  if (theorem) {
    const { optional, rest } = takeOptional(content);

    return `<div class="tex-theorem"><p class="tex-theorem-name">${theorem}${
      optional ? ` (${escapeHtml(optional)})` : ""
    }</p>${renderBlocks(rest, warnings)}</div>`;
  }

  if (name === "tabular" || name === "array") {
    return renderTabular(content, warnings);
  }

  const plain = PLAIN_ENVS[name];

  if (plain) {
    return `<div class="tex-block tex-${plain}">${renderBlocks(
      content,
      warnings
    )}</div>`;
  }

  warnings.push(`\\begin{${name}} is not rendered`);

  return `<div class="tex-block">${renderBlocks(content, warnings)}</div>`;
}

function renderTabular(content: string, warnings: string[]): string {
  const spec = /^\s*\{[^{}]*\}/.exec(content);
  const body = spec ? content.slice(spec[0].length) : content;

  const rows = body
    .split("\\\\")
    .map((row) =>
      row
        .replace(/\\(hline|toprule|midrule|bottomrule)\b/g, "")
        .replace(/\\cline\{[^}]*\}/g, "")
        .trim()
    )
    .filter((row) => row.length > 0);

  if (!rows.length) return "";

  const rendered = rows
    .map((row) => {
      const cells = row
        .split("&")
        .map((cell) => `<td>${renderInline(cell.trim(), warnings)}</td>`)
        .join("");

      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<div class="tex-table-wrap"><table class="tex-table"><tbody>${rendered}</tbody></table></div>`;
}

function splitItems(content: string): string[] {
  const items: string[] = [];
  const pattern = /\\(begin|end)\{[A-Za-z*]+\}|\\item\b/g;
  let depth = 0;
  let cursor = 0;
  let current = "";
  let started = false;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    current += content.slice(cursor, match.index);
    cursor = match.index + match[0].length;

    if (match[1] === "begin") {
      current += match[0];
      depth += 1;
      continue;
    }

    if (match[1] === "end") {
      current += match[0];
      depth -= 1;
      continue;
    }

    if (depth === 0) {
      if (started) items.push(current.trim());
      current = "";
      started = true;
    } else {
      current += match[0];
    }
  }

  current += content.slice(cursor);

  if (started) items.push(current.trim());

  return items;
}

/* ---------- inline ---------- */

function renderInline(source: string, warnings: string[]): string {
  let out = "";
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    if (char === "\\") {
      const next = source[i + 1];

      if (next === undefined) break;

      if (next === "\\") {
        out += "<br/>";
        i += 2;
        continue;
      }

      if (ESCAPED[next] !== undefined) {
        out += escapeHtml(ESCAPED[next]);
        i += 2;
        continue;
      }

      if (next === "(") {
        const end = source.indexOf("\\)", i + 2);
        out += renderMath(
          end === -1 ? source.slice(i + 2) : source.slice(i + 2, end),
          false,
          warnings
        );
        i = end === -1 ? source.length : end + 2;
        continue;
      }

      if (next === "[") {
        const end = source.indexOf("\\]", i + 2);
        out += wrapDisplay(
          end === -1 ? source.slice(i + 2) : source.slice(i + 2, end),
          warnings
        );
        i = end === -1 ? source.length : end + 2;
        continue;
      }

      if (",;:! ".includes(next)) {
        out += " ";
        i += 2;
        continue;
      }

      const name = /^[A-Za-z]+/.exec(source.slice(i + 1))?.[0];

      if (!name) {
        i += 2;
        continue;
      }

      i = renderCommand(source, i, name, warnings, (html) => {
        out += html;
      });
      continue;
    }

    if (char === "$") {
      if (source[i + 1] === "$") {
        const end = source.indexOf("$$", i + 2);
        out += wrapDisplay(
          end === -1 ? source.slice(i + 2) : source.slice(i + 2, end),
          warnings
        );
        i = end === -1 ? source.length : end + 2;
        continue;
      }

      const end = findClosingDollar(source, i + 1);
      out += renderMath(
        end === -1 ? source.slice(i + 1) : source.slice(i + 1, end),
        false,
        warnings
      );
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    if (char === "~") {
      out += "\u00a0";
      i += 1;
      continue;
    }

    if (char === "\n") {
      out += "<br/>";
      i += 1;
      continue;
    }

    out += escapeHtml(char);
    i += 1;
  }

  return out;
}

/** Handles one backslash command and returns the next cursor position. */
function renderCommand(
  source: string,
  start: number,
  name: string,
  warnings: string[],
  emit: (html: string) => void
): number {
  let cursor = start + 1 + name.length;

  if (SPACING[name] !== undefined) {
    cursor = skipOptional(source, cursor);
    emit(SPACING[name]);

    const group = readGroup(source, cursor);
    return group ? group.end : cursor;
  }

  if (name === "begin" || name === "end") {
    const group = readGroup(source, cursor);

    if (group) {
      warnings.push(`\\${name}{${group.value.trim()}} is not rendered`);
      return group.end;
    }

    return cursor;
  }

  if (TWO_ARG_KEEP_LAST.has(name)) {
    const first = readGroup(source, cursor);

    if (first) {
      const second = readGroup(source, first.end);

      if (second) {
        emit(renderInline(second.value, warnings));
        return second.end;
      }

      return first.end;
    }

    return cursor;
  }

  const wrapper = WRAPPERS[name];

  if (wrapper) {
    cursor = skipOptional(source, cursor);
    const group = readGroup(source, cursor);

    if (group) {
      emit(wrap(wrapper, renderInline(group.value, warnings)));
      return group.end;
    }

    return cursor;
  }

  if (DROPPED.has(name)) {
    cursor = skipOptional(source, cursor);

    const group = readGroup(source, cursor);
    return group ? group.end : cursor;
  }

  // Anything left is outside the supported subset: keep whatever text it
  // carries so no content is lost, and tell the user about it.
  cursor = skipOptional(source, cursor);
  const group = readGroup(source, cursor);
  warnings.push(`\\${name} is not rendered`);

  if (group) {
    emit(renderInline(group.value, warnings));
    return group.end;
  }

  return cursor;
}

function wrap(wrapper: string, inner: string): string {
  const [tag, className] = wrapper.split(".");

  return className
    ? `<${tag} class="${className}">${inner}</${tag}>`
    : `<${tag}>${inner}</${tag}>`;
}

/* ---------- math ---------- */

function wrapDisplay(tex: string, warnings: string[]): string {
  const html = renderMath(tex, true, warnings);

  return html ? `<span class="tex-display">${html}</span>` : "";
}

function renderMath(tex: string, display: boolean, warnings: string[]): string {
  const cleaned = tex
    .replace(/\\label\{[^}]*\}/g, "")
    .replace(/\\nonumber\b/g, "")
    .trim();

  if (!cleaned) return "";

  try {
    const html = katex.renderToString(cleaned, {
      displayMode: display,
      throwOnError: false,
      strict: "ignore",
      trust: false,
      output: "html"
    });

    // With throwOnError off, KaTeX reports the failure inside the output.
    if (html.includes("katex-error")) {
      warnings.push(`math could not be typeset: ${cleaned.slice(0, 40)}`);
    }

    return html;
  } catch (error) {
    warnings.push(`math could not be typeset: ${cleaned.slice(0, 40)}`);

    return `<code class="tex-error">${escapeHtml(cleaned)}</code>`;
  }
}

/* ---------- tiny parsers ---------- */

function readGroup(
  source: string,
  start: number
): { value: string; end: number } | null {
  if (source[start] !== "{") return null;

  let depth = 0;

  for (let i = start; i < source.length; i += 1) {
    const char = source[i];

    if (char === "\\") {
      i += 1;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return { value: source.slice(start + 1, i), end: i + 1 };
      }
    }
  }

  return null;
}

function skipOptional(source: string, start: number): number {
  if (source[start] !== "[") return start;

  let depth = 0;

  for (let i = start; i < source.length; i += 1) {
    const char = source[i];

    if (char === "\\") {
      i += 1;
      continue;
    }

    if (char === "[") {
      depth += 1;
      continue;
    }

    if (char === "]") {
      depth -= 1;

      if (depth === 0) return i + 1;
    }
  }

  return start;
}

function takeOptional(source: string): { optional: string; rest: string } {
  const trimmed = source.replace(/^[\s\n]+/, "");

  if (trimmed[0] !== "[") return { optional: "", rest: source };

  const end = skipOptional(trimmed, 0);

  return end === 0
    ? { optional: "", rest: source }
    : { optional: trimmed.slice(1, end - 1), rest: trimmed.slice(end) };
}

function findClosingDollar(source: string, from: number): number {
  for (let i = from; i < source.length; i += 1) {
    if (source[i] === "\\") {
      i += 1;
      continue;
    }

    if (source[i] === "$") return i;
  }

  return -1;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
