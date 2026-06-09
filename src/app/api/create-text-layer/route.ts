import { NextRequest } from "next/server";
import { createOpenAIClient, openAIConfigurationError } from "@/lib/openai";

export const maxDuration = 120;

const layoutModel = process.env.OPENAI_LAYOUT_MODEL ?? "gpt-5.4";

type TextLayerMode = "manual" | "creative-import";

type TextSpan = {
  id: string;
  text: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  color: string;
};

type TextBlock = {
  id: string;
  role: "hook" | "body" | "cta" | "badge" | "price" | "disclaimer" | "logo" | "other";
  text: string;
  spans: TextSpan[] | null;
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  letterSpacing: number;
  color: string;
  align: "left" | "center" | "right";
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
  zIndex: number;
  otherStyles: string;
};

type LayoutResult = {
  globalStyles: string;
  blocks: TextBlock[];
};

const textSpanSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    text: { type: "string" },
    fontSize: { type: "number" },
    fontWeight: { type: "number" },
    letterSpacing: { type: "number" },
    color: { type: "string" },
  },
  required: ["id", "text", "fontSize", "fontWeight", "letterSpacing", "color"],
  additionalProperties: false,
};

const textBlockSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    role: {
      type: "string",
      enum: ["hook", "body", "cta", "badge", "price", "disclaimer", "logo", "other"],
    },
    text: { type: "string" },
    spans: {
      type: ["array", "null"],
      items: textSpanSchema,
    },
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number" },
    height: { type: "number" },
    fontFamily: { type: "string" },
    fontSize: { type: "number" },
    lineHeight: { type: "number" },
    fontWeight: { type: "number" },
    letterSpacing: { type: "number" },
    color: { type: "string" },
    align: { type: "string", enum: ["left", "center", "right"] },
    textTransform: {
      type: "string",
      enum: ["none", "uppercase", "lowercase", "capitalize"],
    },
    zIndex: { type: "number" },
    otherStyles: { type: "string" },
  },
  required: [
    "id",
    "role",
    "text",
    "spans",
    "x",
    "y",
    "width",
    "height",
    "fontFamily",
    "fontSize",
    "lineHeight",
    "fontWeight",
    "letterSpacing",
    "color",
    "align",
    "textTransform",
    "zIndex",
    "otherStyles",
  ],
  additionalProperties: false,
};

const responseSchema = {
  type: "object",
  properties: {
    globalStyles: { type: "string" },
    blocks: {
      type: "array",
      items: textBlockSchema,
    },
  },
  required: ["globalStyles", "blocks"],
  additionalProperties: false,
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const mode = normalizeMode(formData.get("mode"));
    const width = parseDimension(formData.get("width"));
    const height = parseDimension(formData.get("height"));
    const pastedText = normalizePastedText(formData.get("pastedText"));
    const templateLayout = parseTemplateLayout(formData.get("templateLayout"));
    const sourceFile = formData.get("sourceImage") as File | null;

    if (!width || !height) {
      return Response.json({ error: "Invalid canvas size" }, { status: 400 });
    }

    if (!templateLayout?.blocks.length) {
      return Response.json({ error: "No template layout provided" }, { status: 400 });
    }

    if (mode === "manual" && !pastedText) {
      return Response.json({ error: "No text provided" }, { status: 400 });
    }

    if (mode === "creative-import" && !sourceFile) {
      return Response.json({ error: "No source creative provided" }, { status: 400 });
    }

    const content: Array<
      | { type: "input_text"; text: string }
      | { type: "input_image"; image_url: string; detail: "original" }
    > = [
      {
        type: "input_text",
        text: buildPromptHeader(mode, width, height, templateLayout),
      },
    ];

    if (mode === "manual") {
      content.push({
        type: "input_text",
        text: `NEW TEXT CONTENT PROVIDED BY USER:\n\n${pastedText}`,
      });
    } else if (sourceFile) {
      const bytes = await sourceFile.arrayBuffer();
      const mimeType = sourceFile.type || "image/png";
      content.push(
        {
          type: "input_text",
          text: "SOURCE COPY CREATIVE: extract the visible text/content from this image, then adapt it to the template layout style.",
        },
        {
          type: "input_image",
          image_url: toDataUrl(Buffer.from(bytes), mimeType),
          detail: "original",
        },
      );
    }

    content.push({
      type: "input_text",
      text: buildPromptRules(),
    });

    const openai = createOpenAIClient();
    if (!openai) return openAIConfigurationError();

    const response = await openai.responses.create({
      model: layoutModel,
      instructions:
        "You are a senior production designer adapting new ad copy into an existing editable creative layout system.",
      input: [
        {
          role: "user",
          content,
        },
      ],
      reasoning: { effort: "medium" },
      text: {
        format: {
          type: "json_schema",
          name: "new_text_layer_layout",
          description:
            "A complete editable text layer adapted to an existing creative template layout.",
          strict: true,
          schema: responseSchema,
        },
      },
      max_output_tokens: 8000,
      store: false,
    });

    const result = normalizeLayout(
      JSON.parse(response.output_text ?? "{}") as LayoutResult,
      width,
      height,
    );

    return Response.json(result);
  } catch (err) {
    console.error("create-text-layer failed", err);
    return Response.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return "Failed to create text layer";
}

function buildPromptHeader(
  mode: TextLayerMode,
  width: number,
  height: number,
  templateLayout: LayoutResult,
) {
  const sourceDescription =
    mode === "manual"
      ? "The user provided raw text. Parse it into logical ad blocks, then fit it into the template style."
      : "The user provided another creative image. Extract visible text from it, preserve that content, then fit it into the template style.";

  return `Create a NEW COMPLETE TEXT LAYER for an existing advertising creative.

Canvas size: ${width}px wide x ${height}px high.

${sourceDescription}

The current TEMPLATE LAYOUT below is the visual/style reference. It already fits the background well.
Use it for composition, hierarchy, roles, coordinates, sizing, typography, colors, z-index, and decorative styles.
Do not treat template text as copy that must be preserved.

TEMPLATE LAYOUT:
${JSON.stringify(templateLayout, null, 2)}`;
}

function buildPromptRules() {
  return `Return one complete LayoutResult JSON object:
{
  "globalStyles": "...",
  "blocks": []
}

Core task:
- Adapt the new content into the template layout style.
- Return a full layout snapshot, not patches and not HTML.
- Use the user's new content as the source of truth.
- Do not rewrite, improve, translate, or invent marketing copy unless tiny wording is required to preserve readable labels from an imported image.
- You may add line breaks to make text fit.
- Preserve the same language as the provided content/source creative.

Template adaptation rules:
- Reuse template blocks when the new content has matching roles: hook, body, CTA, badge, price, disclaimer, logo, other.
- If the new content has fewer logical parts than the template, remove unused blocks.
- If the new content has more logical parts than the template, create additional blocks using the closest matching template block style.
- Keep the overall visual hierarchy close to the template: big hook remains big, CTA remains CTA-like, small disclaimers remain small.
- Keep coordinates, width, height, fontFamily, fontSize, lineHeight, fontWeight, letterSpacing, color, align, textTransform, zIndex, and otherStyles as close to the template as possible.
- It is acceptable for the final block count to differ from the template block count.
- Use stable ids such as "headline", "body-1", "cta", "badge-1", "price", "disclaimer".

Layout safety rules:
- Every block must stay inside the canvas.
- Text blocks must not overlap unless the template clearly has intentional overlap.
- If text is too long, reduce fontSize first, then lineHeight proportionally, then letterSpacing, then increase width within the canvas.
- Prefer slightly smaller text over clipping or overlap.
- Do not put all content into one giant block if the source has logical sections.
- Use explicit "\\n" line breaks for important multi-line text. Do not rely on accidental browser wrapping.
- height must be large enough for all rendered lines.
- Keep at least 2px vertical gap between related stacked text boxes and 6px between separate groups when possible.

Span and style rules:
- If a whole block has one style, set spans to null.
- Use spans only when one logical block has meaningful inline style differences.
- block.text must equal concatenated span.text exactly when spans is not null.
- Do not create one span that duplicates the whole block.
- otherStyles is only for decorative CSS such as text-shadow, border, border-radius, padding, background, opacity.
- Never put position, left, top, width, height, transform, font-family, font-size, line-height, font-weight, letter-spacing, color, text-align, text-transform, z-index, overflow, white-space, display, or margin in otherStyles.

Imported creative image rules:
- Extract visible text faithfully from the source creative.
- Ignore non-text visual style from the imported creative. The output should look like the template creative, not the imported creative.
- Do not include fake OCR uncertainty notes. If a word is unreadable, use a short best estimate.

Return only valid JSON matching the schema.`;
}

function parseTemplateLayout(value: FormDataEntryValue | null): LayoutResult | null {
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value) as LayoutResult;
    return {
      globalStyles: typeof parsed.globalStyles === "string" ? parsed.globalStyles : "",
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
    };
  } catch {
    return null;
  }
}

function normalizeLayout(result: LayoutResult, canvasWidth: number, canvasHeight: number): LayoutResult {
  const blocks = Array.isArray(result.blocks) ? result.blocks : [];
  const normalizedBlocks = preventOverlaps(
    blocks.map((block, index) => normalizeBlock(block, index, canvasWidth, canvasHeight)),
    canvasWidth,
    canvasHeight,
  );

  return {
    globalStyles: typeof result.globalStyles === "string" ? result.globalStyles : "",
    blocks: normalizedBlocks,
  };
}

function normalizeBlock(
  block: TextBlock,
  index: number,
  canvasWidth: number,
  canvasHeight: number,
): TextBlock {
  const margin = 6;
  const fontSize = clampNumber(block.fontSize, 8, Math.max(12, canvasHeight * 0.18), 16);
  const lineHeight = clampNumber(
    block.lineHeight,
    fontSize * 0.9,
    fontSize * 1.8,
    Math.round(fontSize * 1.12),
  );
  const x = clampNumber(block.x, 0, canvasWidth - margin, margin);
  const y = clampNumber(block.y, 0, canvasHeight - margin, margin);
  const maxWidth = Math.max(margin, canvasWidth - x - margin);
  const maxHeight = Math.max(margin, canvasHeight - y - margin);

  const normalized: TextBlock = {
    ...block,
    id: typeof block.id === "string" && block.id.trim() ? block.id : `block-${index + 1}`,
    role: normalizeRole(block.role),
    text: typeof block.text === "string" ? block.text : "",
    spans: null,
    x,
    y,
    width: clampNumber(block.width, 8, maxWidth, Math.min(maxWidth, canvasWidth * 0.75)),
    height: clampNumber(block.height, 8, maxHeight, lineHeight),
    fontFamily: typeof block.fontFamily === "string" && block.fontFamily.trim()
      ? block.fontFamily
      : "Arial, Helvetica, sans-serif",
    fontSize,
    lineHeight,
    fontWeight: normalizeFontWeight(block.fontWeight),
    letterSpacing: clampNumber(block.letterSpacing, -3, 8, 0),
    color: typeof block.color === "string" && block.color.trim() ? block.color : "#111111",
    align: ["left", "center", "right"].includes(block.align) ? block.align : "left",
    textTransform: ["none", "uppercase", "lowercase", "capitalize"].includes(block.textTransform)
      ? block.textTransform
      : "none",
    zIndex: clampNumber(block.zIndex, 0, 100, index + 1),
    otherStyles: sanitizeOtherStyles(block.otherStyles),
  };

  normalized.spans = normalizeSpans(block.spans, normalized);
  if (normalized.spans) {
    normalized.text = normalized.spans.map((span) => span.text).join("");
  }
  fitTextInsideBlock(normalized, canvasWidth, canvasHeight);
  return normalized;
}

function normalizeSpans(spans: TextSpan[] | null | undefined, block: TextBlock): TextSpan[] | null {
  if (!Array.isArray(spans) || !spans.length) return null;

  const normalizedSpans = spans.map((span, index) => ({
    id: typeof span.id === "string" && span.id.trim() ? span.id : `span-${index + 1}`,
    text: typeof span.text === "string" ? span.text : "",
    fontSize: clampNumber(span.fontSize, 8, block.fontSize * 1.5, block.fontSize),
    fontWeight: normalizeFontWeight(span.fontWeight),
    letterSpacing: clampNumber(span.letterSpacing, -3, 8, block.letterSpacing),
    color: typeof span.color === "string" && span.color.trim() ? span.color : block.color,
  }));

  if (normalizedSpans.length === 1) {
    const [span] = normalizedSpans;
    block.text = span.text;
    block.fontSize = span.fontSize;
    block.fontWeight = span.fontWeight;
    block.letterSpacing = span.letterSpacing;
    block.color = span.color;
    return null;
  }

  return normalizedSpans;
}

function fitTextInsideBlock(block: TextBlock, canvasWidth: number, canvasHeight: number) {
  const margin = 6;
  const maxWidth = Math.max(margin, canvasWidth - block.x - margin);
  const desiredWidth = estimateMaxLineWidth(block) + 4;

  if (desiredWidth > block.width) {
    block.width = Math.min(maxWidth, Math.max(block.width, desiredWidth));
  }

  let estimatedLines = estimateRenderedLines(block);
  let desiredHeight = estimatedLines * block.lineHeight;

  while (
    (desiredHeight > block.height || block.x + block.width > canvasWidth - margin) &&
    block.fontSize > 8
  ) {
    const previousFontSize = block.fontSize;
    block.fontSize = Math.max(8, Number((block.fontSize * 0.92).toFixed(2)));
    block.lineHeight = Math.max(8, Number((block.lineHeight * (block.fontSize / previousFontSize)).toFixed(2)));
    block.letterSpacing = Math.max(-2, Number((block.letterSpacing - 0.05).toFixed(2)));
    block.width = Math.min(maxWidth, Math.max(block.width, estimateMaxLineWidth(block) + 4));
    estimatedLines = estimateRenderedLines(block);
    desiredHeight = estimatedLines * block.lineHeight;
  }

  block.height = Math.min(
    Math.max(canvasHeight - block.y - margin, margin),
    Math.max(block.height, Math.ceil(desiredHeight)),
  );
}

function preventOverlaps(blocks: TextBlock[], canvasWidth: number, canvasHeight: number) {
  const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const minGap = 2;

  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < sorted.length; i += 1) {
      const current = sorted[i];

      for (let j = i + 1; j < sorted.length; j += 1) {
        const next = sorted[j];

        if (next.y > current.y + current.height + 24) break;
        if (!boxesOverlap(current, next)) continue;

        const availableHeight = next.y - current.y - minGap;

        if (availableHeight >= 8 && availableHeight < current.height) {
          shrinkBlockToHeight(current, availableHeight, canvasWidth, canvasHeight);
        }

        if (boxesOverlap(current, next)) {
          next.y = Math.min(
            Math.max(current.y + current.height + minGap, next.y),
            Math.max(0, canvasHeight - next.height - minGap),
          );
        }

        fitTextInsideBlock(next, canvasWidth, canvasHeight);
      }
    }
  }

  return blocks;
}

function shrinkBlockToHeight(
  block: TextBlock,
  targetHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  while (block.height > targetHeight && block.fontSize > 8) {
    const previousFontSize = block.fontSize;
    block.fontSize = Math.max(8, Number((block.fontSize * 0.9).toFixed(2)));
    block.lineHeight = Math.max(8, Number((block.lineHeight * (block.fontSize / previousFontSize)).toFixed(2)));
    block.letterSpacing = Math.max(-2, Number((block.letterSpacing - 0.1).toFixed(2)));
    block.width = Math.min(canvasWidth - block.x - 6, Math.max(block.width, estimateMaxLineWidth(block) + 4));
    block.height = Math.ceil(estimateRenderedLines(block) * block.lineHeight);
  }

  block.height = Math.min(block.height, Math.max(8, canvasHeight - block.y - 6));
}

function boxesOverlap(a: TextBlock, b: TextBlock) {
  const horizontalOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const verticalOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return horizontalOverlap > 2 && verticalOverlap > 0;
}

function estimateRenderedLines(block: TextBlock) {
  return block.text.split("\n").reduce((total, line) => {
    const lineWidth = estimateLineWidth(line, block);
    return total + Math.max(1, Math.ceil(lineWidth / Math.max(1, block.width)));
  }, 0);
}

function estimateMaxLineWidth(block: TextBlock) {
  return Math.max(...block.text.split("\n").map((line) => estimateLineWidth(line, block)), 0);
}

function estimateLineWidth(line: string, block: TextBlock) {
  const text = applyTextTransform(line, block.textTransform);
  const uppercaseRatio = text.length ? text.replace(/[^A-Z]/g, "").length / text.length : 0;
  const weightFactor = block.fontWeight >= 700 ? 0.62 : 0.56;
  const charFactor = weightFactor + uppercaseRatio * 0.05;
  const tracking = Math.max(-1, block.letterSpacing) * Math.max(0, text.length - 1);
  return text.length * block.fontSize * charFactor + tracking;
}

function applyTextTransform(text: string, transform: TextBlock["textTransform"]) {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") {
    return text.replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return text;
}

function normalizeRole(value: unknown): TextBlock["role"] {
  if (
    value === "hook" ||
    value === "body" ||
    value === "cta" ||
    value === "badge" ||
    value === "price" ||
    value === "disclaimer" ||
    value === "logo" ||
    value === "other"
  ) {
    return value;
  }

  return "other";
}

function normalizeFontWeight(value: number) {
  const weight = clampNumber(value, 300, 900, 400);
  return Math.round(weight / 100) * 100;
}

function sanitizeOtherStyles(value: unknown) {
  if (typeof value !== "string") return "";

  const blockedProperties = new Set([
    "position",
    "left",
    "top",
    "right",
    "bottom",
    "width",
    "height",
    "transform",
    "font-family",
    "font-size",
    "line-height",
    "font-weight",
    "letter-spacing",
    "color",
    "text-align",
    "text-transform",
    "z-index",
    "overflow",
    "white-space",
    "display",
    "margin",
  ]);

  return value
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter((declaration) => {
      const property = declaration.split(":")[0]?.trim().toLowerCase();
      return property && !blockedProperties.has(property);
    })
    .join("; ");
}

function normalizeMode(value: FormDataEntryValue | null): TextLayerMode {
  if (value === "manual" || value === "creative-import") return value;
  return "manual";
}

function normalizePastedText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 6000);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseDimension(value: FormDataEntryValue | null) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
