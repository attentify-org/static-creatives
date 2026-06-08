import { NextRequest } from "next/server";
import { createOpenAIClient, openAIConfigurationError } from "@/lib/openai";

export const maxDuration = 120;

const layoutModel = process.env.OPENAI_LAYOUT_MODEL ?? "gpt-5.4";

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
  const formData = await request.formData();
  const file = formData.get("image") as File | null;
  const width = parseDimension(formData.get("width"));
  const height = parseDimension(formData.get("height"));

  if (!file) {
    return Response.json({ error: "No image provided" }, { status: 400 });
  }

  if (!width || !height) {
    return Response.json({ error: "Invalid canvas size" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const mimeType = file.type || "image/png";
  const sourceImageDataUrl = toDataUrl(Buffer.from(bytes), mimeType);

  const openai = createOpenAIClient();
  if (!openai) return openAIConfigurationError();

  const response = await openai.responses.create({
    model: layoutModel,
    instructions:
      "You are a senior production designer converting static ad creatives into editable absolute-positioned text layouts.",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "SOURCE CREATIVE: original ad creative with all visible text.",
          },
          {
            type: "input_image",
            image_url: sourceImageDataUrl,
            detail: "original",
          },
          {
            type: "input_text",
            text: buildPrompt(width, height),
          },
        ],
      },
    ],
    reasoning: { effort: "medium" },
    text: {
      format: {
        type: "json_schema",
        name: "editable_creative_layout",
        description:
          "Editable absolute-positioned text layout for recreating the source creative.",
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
}

function buildPrompt(width: number, height: number) {
  return `You are given the SOURCE CREATIVE image.

We already have an empty HTML canvas with the same visual composition and a cleaned background image with all text removed.
The target HTML canvas is exactly ${width}px wide and ${height}px high.

Your task:
Return an editable JSON text layout that reconstructs the SOURCE CREATIVE text layer on top of that empty canvas.

This is NOT a variation-generation task.
Do not rewrite, improve, translate, shorten, expand, or invent marketing copy.
Preserve the original visible text content exactly where readable.
If a word is unreadable, use your best visual estimate and keep it short.

The app will render each block as:
position: absolute;
left: block.x px;
top: block.y px;
width: block.width px;
height: block.height px;
box-sizing: border-box;
font-family: block.fontFamily;
font-size: block.fontSize px;
line-height: block.lineHeight px;
font-weight: block.fontWeight;
letter-spacing: block.letterSpacing px;
color: block.color;
text-align: block.align;
text-transform: block.textTransform;
z-index: block.zIndex;
additional decorative CSS from block.otherStyles.

Inside a block, the app supports exactly one optional nested inline level:
block.spans = [
  {
    "id": "span-1",
    "text": "Week 1:",
    "fontSize": 12,
    "fontWeight": 700,
    "letterSpacing": 0,
    "color": "#ff1f12"
  },
  {
    "id": "span-2",
    "text": " Regain focus.",
    "fontSize": 12,
    "fontWeight": 600,
    "letterSpacing": 0,
    "color": "#111111"
  }
]

If the whole block has one consistent style, set block.spans to null.
Do not return a single span that duplicates the whole block.
Use block-level style fields directly for uniform text.

Return one object:
{
  "globalStyles": "CSS string for font imports and shared font declarations only",
  "blocks": []
}

Block requirements:
- Include every meaningful visible text element: headline/hook, body copy, CTA, badges, prices, disclaimers, and text-like logo marks.
- Use role "hook" only for the main headline/main promise.
- Use role "cta" only for button or call-to-action labels.
- Use role "logo" only for typography-only brand marks.
- Use role "other" only when the element does not fit another role.
- Make stable block ids such as "headline", "body-1", "cta", "price", "badge-1".
- Coordinates must be for the ${width}px x ${height}px target canvas, not for any other imagined size.
- x and y are the top-left corner of the visual text bounding box.
- width and height are the intended visual bounding box of the text block.
- Estimate the right edge and bottom edge carefully. The block should contain the rendered text without clipping and without large extra empty space.
- Use explicit line breaks inside text with "\\n" for multi-line text. Do not rely on browser wrapping for important line breaks.
- Preserve logical text groups as single editable blocks.
- Do not split one logical phrase, sentence, list item, or label/value row into multiple blocks just because parts have different color, weight, or emphasis.
- Examples that must stay as one block: "Week 1: Regain focus.", "Week 2: Clear your mental clutter.", "28-day challenge", "Just 15 minutes a day".
- For mixed-style logical groups, keep one block and represent the different inline styles with spans.
- Use spans only one level deep. Do not nest spans. Do not create positioned children inside spans.
- block.text must equal the concatenated span.text values exactly, including spaces and "\\n" line breaks, when spans is not null.
- If a block has no inline style differences, set spans to null. Do not create a one-item spans array.
- If a phrase has a red label and black value, keep them in one block and use two spans, for example "Week 1:" red and " Regain focus." black.
- Do not use spans to split every word. Use the smallest number of spans needed to preserve meaningful inline style differences.
- Split text only when elements are truly separate editable objects: separate headline vs body copy vs CTA vs badge vs disclaimer, or visually separate text groups with clear spacing.
- If related lines belong to one paragraph/list/section and share the same editing intent, keep them in one block with "\\n".
- Preserve font size, weight, line height, letter spacing, color, alignment, capitalization, and visual hierarchy as closely as possible.
- fontWeight must be numeric: 300, 400, 500, 600, 700, 800, or 900.
- letterSpacing is in px. Use 0 when normal, negative values for tight tracking, positive values for wide tracking.
- lineHeight is in px, not a unitless multiplier.
- Use a real Google Font family if it is a close match. Otherwise use a safe fallback such as Arial, Helvetica, Georgia, or Impact.
- Put @import or @font-face declarations in globalStyles when using Google Fonts.
- Keep globalStyles limited to fonts/shared declarations. Do not put positioned block CSS there.
- otherStyles is a CSS declaration string for extra visual styling only, for example "text-shadow: 0 2px 4px rgba(0,0,0,.35);" or "border: 2px solid #fff; border-radius: 6px; padding: 4px 8px;".
- Use otherStyles only when the source text has visible effects such as shadows, outlines, strokes, background fills, borders, rounded CTA boxes, opacity, blend mode, or padding.
- If there are no extra visual effects, set otherStyles to an empty string.
- Never put position, left, top, right, bottom, width, height, transform, font-family, font-size, line-height, font-weight, letter-spacing, color, text-align, text-transform, z-index, overflow, white-space, display, or margin in otherStyles.

Accuracy rules:
- NON-OVERLAP IS THE MOST IMPORTANT RULE. A layout with overlapping text is a failed output even if the text content is correct.
- The first output should be an editable replica of the original creative, not a new creative.
- Text blocks must not overlap unless the SOURCE CREATIVE clearly overlaps them. In normal ad creatives, stacked lines must have clear vertical separation.
- Before returning, mentally render the exact CSS box model above. Check every block against the next block below it and beside it.
- If there is any chance that a line wraps unexpectedly, overlaps the next line, touches another block, or spills outside its height, choose a smaller fontSize immediately.
- If text is still at risk after reducing fontSize, reduce letterSpacing next.
- If text is still at risk, increase the block width. You may increase width up to almost the full canvas width while staying inside the canvas.
- It is better to use text that is slightly too small and a block that is slightly too wide than to create any overlap.
- Do not create many tiny separate blocks inside one crowded paragraph if that makes vertical spacing uncertain. Prefer one block with explicit "\\n" line breaks when the style is shared.
- Give each block enough height for all explicit lines: height must be at least lineCount * lineHeight.
- Leave at least 2px vertical gap between related stacked text boxes and at least 6px between separate text groups unless the source visibly has tighter spacing.
- Text must not go outside the ${width}px x ${height}px canvas.
- Prefer slightly smaller font sizes over accidental wrapping or overlap.
- If a text area is narrow, reduce fontSize first, reduce letterSpacing second, and increase width third. For preventing overlap, increasing width up to 92% of the canvas is allowed.
- Use height and lineHeight to make the editor preview predictable.

Return only valid JSON matching the schema.`;
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
