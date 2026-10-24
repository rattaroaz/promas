import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Type comes from the scale in App.css :root. A rule or inline style that
 * sets its own face, size, line height, weight, or spacing fails here, so a
 * screen cannot drift from the rest of the app. The rendered check is
 * e2e/tests/typography.spec.ts.
 */

type Decl = { context: string; prop: string; value: string; line: number };
type Scale = { steps: Set<string>; leadings: Set<string>; tokens: Set<string> };

const SRC = __dirname;

const TYPE_PROPS = new Set([
  "font",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "font-stretch",
  "line-height",
  "letter-spacing",
  "word-spacing",
]);

/** What the page itself declares. Every other rule inherits or picks a step. */
const PAGE: Record<string, Record<string, string>> = {
  html: {
    "font-family": "var(--font-dos)",
    "font-size": "var(--text-root)",
    "line-height": "var(--leading-normal)",
  },
  "@media print > html": { "font-size": "var(--text-print)" },
};

/** Comments and url() bodies keep their newlines but cannot read as syntax. */
function blank(css: string): string {
  const spaces = (m: string) => m.replace(/[^\n]/g, " ");
  return css.replace(/\/\*[\s\S]*?\*\//g, spaces).replace(/url\([^)]*\)/g, spaces);
}

function declarations(css: string): Decl[] {
  const out: Decl[] = [];
  const stack: string[] = [];
  let chunk = "";
  let chunkLine = 0;
  let line = 1;
  for (const ch of blank(css)) {
    if (ch === "{" || ch === "}" || ch === ";") {
      const body = chunk.trim();
      if (ch === "{") {
        stack.push(body.replace(/\s+/g, " "));
      } else if (body && stack.length) {
        const colon = body.indexOf(":");
        if (colon > 0) {
          out.push({
            context: stack.join(" > "),
            prop: body.slice(0, colon).trim().toLowerCase(),
            value: body.slice(colon + 1).trim().replace(/\s+/g, " "),
            line: chunkLine,
          });
        }
      }
      if (ch === "}") stack.pop();
      chunk = "";
      chunkLine = 0;
    } else {
      if (!chunkLine && !/\s/.test(ch)) chunkLine = line;
      chunk += ch;
    }
    if (ch === "\n") line++;
  }
  return out;
}

function scaleOf(decls: Decl[]): Scale {
  const tokens = new Set(
    decls.filter((d) => d.context === ":root" && d.prop.startsWith("--")).map((d) => d.prop)
  );
  const pageSizes = new Set(Object.values(PAGE).map((rule) => rule["font-size"]));
  const pick = (prefix: string) =>
    new Set([...tokens].filter((t) => t.startsWith(prefix) && !pageSizes.has(`var(${t})`)));
  return { steps: pick("--text-"), leadings: pick("--leading-"), tokens };
}

function offScale(d: Decl, scale: Scale): boolean {
  const value = d.value.replace(/\s*!important$/i, "");
  if (value === "inherit") return false;
  const page = PAGE[d.context];
  if (page) return page[d.prop] !== value;
  const token = /^var\((--[\w-]+)\)$/.exec(value)?.[1] ?? "";
  switch (d.prop) {
    case "font-size":
      return !scale.steps.has(token);
    case "line-height":
      return !scale.leadings.has(token);
    case "font-weight":
      return value !== "normal" && value !== "bold";
    default:
      return true;
  }
}

function offenders(decls: Decl[], scale: Scale): string[] {
  return decls
    .filter((d) => TYPE_PROPS.has(d.prop) && offScale(d, scale))
    .map((d) => `App.css:${d.line} ${d.context} { ${d.prop}: ${d.value} }`);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const CSS_TEXT = /\b(font-(family|size|weight|style|variant|stretch)|line-height|letter-spacing|word-spacing)\s*:/;
const STYLE_WRITE = /\.style\.(font|fontFamily|fontSize|fontWeight|fontStyle|lineHeight|letterSpacing)\s*=/;
const STYLE_KEY =
  /\b(fontFamily|fontSize|fontWeight|fontStyle|fontVariant|fontStretch|lineHeight|letterSpacing|wordSpacing)\??\s*:(?!\s*(number|string)\b)|[{,]\s*(fontFamily|fontSize|fontWeight|lineHeight|letterSpacing)\s*[,}]|\bfont\s*:\s*["'`\d]/;

describe("type scale in App.css", () => {
  const decls = declarations(readFileSync(join(SRC, "App.css"), "utf8"));
  const scale = scaleOf(decls);

  it("sets the face, root size, and line height once, on html", () => {
    const declared = (context: string) =>
      Object.fromEntries(
        decls.filter((d) => d.context === context && TYPE_PROPS.has(d.prop)).map((d) => [d.prop, d.value])
      );
    expect(declared("html")).toEqual(PAGE.html);
    expect(declared("@media print > html")).toEqual(PAGE["@media print > html"]);
    expect(scale.steps.size).toBeGreaterThan(0);
    expect(scale.leadings.size).toBeGreaterThan(0);
  });

  it("picks every other size and line height from the scale", () => {
    expect(offenders(decls, scale)).toEqual([]);
  });

  it("names only tokens that :root defines", () => {
    const missing = decls
      .flatMap((d) => [...d.value.matchAll(/var\((--(?:text|leading|font)-[\w-]+)/g)].map((m) => ({ d, token: m[1] })))
      .filter(({ token }) => !scale.tokens.has(token))
      .map(({ d, token }) => `App.css:${d.line} ${token}`);
    expect(missing).toEqual([]);
  });

  it("catches a rule that sets its own type", () => {
    const sample = declarations(`
      :root { --text-root: 32px; --text-sm: 0.9rem; --leading-normal: 1.15; }
      .a { font-size: 0.95em; line-height: 1.2; font-family: Arial; letter-spacing: 1px; font-weight: 600; }
      .b { font-size: var(--text-sm); line-height: var(--leading-normal); font: inherit; font-weight: bold; }
      .c { font-size: var(--text-root); }
      @media print { .d { font-size: 10pt; } }
    `);
    expect(offenders(sample, scaleOf(sample)).map((line) => line.replace(/^App\.css:\d+ /, ""))).toEqual([
      ".a { font-size: 0.95em }",
      ".a { line-height: 1.2 }",
      ".a { font-family: Arial }",
      ".a { letter-spacing: 1px }",
      ".a { font-weight: 600 }",
      ".c { font-size: var(--text-root) }",
      "@media print > .d { font-size: 10pt }",
    ]);
  });
});

describe("components", () => {
  it("carry no inline type", () => {
    const files = [...sourceFiles(SRC), join(SRC, "..", "index.html")];
    const found: string[] = [];
    for (const file of files) {
      const tsx = file.endsWith(".tsx");
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((text, i) => {
          if (CSS_TEXT.test(text) || STYLE_WRITE.test(text) || (tsx && STYLE_KEY.test(text))) {
            found.push(`${relative(join(SRC, ".."), file).replace(/\\/g, "/")}:${i + 1} ${text.trim()}`);
          }
        });
    }
    expect(files.length).toBeGreaterThan(20);
    expect(found).toEqual([]);
  });
});
