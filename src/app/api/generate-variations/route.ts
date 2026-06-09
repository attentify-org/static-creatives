import { NextRequest } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { createOpenAIClient, openAIConfigurationError } from "@/lib/openai";

export const maxDuration = 120;

const layoutModel = process.env.OPENAI_LAYOUT_MODEL ?? "gpt-5.4";

const responseSchema = {
  type: "object",
  properties: {
    res: { type: "string" },
  },
  required: ["res"],
  additionalProperties: false,
};

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("image") as File;
  const width = parseInt(formData.get("width") as string);
  const height = parseInt(formData.get("height") as string);
  const baseHtml = formData.get("baseHtml") as string;
  const newHook = formData.get("newHook") as string | null;

  if (!file) {
    return Response.json({ error: "No image provided" }, { status: 400 });
  }

  if (!baseHtml) {
    return Response.json({ error: "No base HTML provided" }, { status: 400 });
  }

  const openai = createOpenAIClient();
  if (!openai) return openAIConfigurationError();

  const bytes = await file.arrayBuffer();
  const mimeType = file.type || "image/png";
  const sourceImageDataUrl = toDataUrl(Buffer.from(bytes), mimeType);

  const response = await openai.responses.create({
    model: layoutModel,
    instructions:
      "You are a senior HTML/CSS designer. Your job is to make the returned HTML visually match the source ad creative as closely as possible.",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "SOURCE CREATIVE: original ad creative with text.",
          },
          {
            type: "input_image",
            image_url: sourceImageDataUrl,
            detail: "original",
          },
          {
            type: "input_text",
            text: buildPrompt(width, height, baseHtml, newHook),
          },
        ],
      },
    ],
    reasoning: { effort: "medium" },
    text: {
      format: {
        type: "json_schema",
        name: "variations",
        description:
          "One complete static HTML document for a creative variation.",
        strict: true,
        schema: responseSchema,
      },
    },
    max_output_tokens: 8000,
    store: false,
  });

  const content = response.output_text ?? "{}";
  const result = JSON.parse(content);
  const htmlPath = await saveGeneratedHtml(result.res);

  return Response.json({ ...result, htmlPath });
}

function buildPrompt(
  width: number,
  height: number,
  baseHtml: string,
  newHook: string | null,
): string {
  const hookInstruction = newHook?.trim()
    ? `Use this exact new hook/headline: "${newHook.trim()}".`
    : "Generate one new similar hook/headline.";

  return `You are a senior HTML/CSS designer.

You are given:
1. SOURCE CREATIVE: the original advertising image with text.
2. BASE HTML: an empty HTML document where the same creative image with all text removed is already connected as the body background.

BASE HTML:

${baseHtml}

Your job:
Use BASE HTML as the starting template. Create ONE complete HTML document that recreates the text layout from SOURCE CREATIVE on top of the background already connected in BASE HTML.

Main requirement:
- Change ONLY the main hook/headline to a new similar hook.
- ${hookInstruction}
- Keep all other text content the same as in SOURCE CREATIVE.
- Preserve layout, proportions, spacing, font sizes, visual hierarchy, boldness, line breaks, colors, underlines, and alignment as closely as possible.
- Pay very close attention to font size and font weight. If you are uncertain, choose slightly smaller and slightly less bold text rather than larger/heavier text.
- Do not make text visually louder than the original. Avoid oversized, overly bold, or compressed typography.
- Pay attention to letter spacing / tracking. Match how tight or wide the letters are in SOURCE CREATIVE.

Safety / reliability rules:
- Use fixed canvas ${width}px x ${height}px.
- Keep the body background-image URL from BASE HTML unchanged.
- Keep the body width and height equal to ${width}px x ${height}px.
- Use absolute positioning for text blocks.
- Use Google Fonts if needed. Add Google Fonts <link rel="preconnect"> and <link rel="stylesheet"> tags to the returned HTML and use those font-family names in CSS.
- Do not allow text blocks to overlap.
- Do not let text go outside the canvas.
- Width and line wrapping are critical. For every text group, estimate the available visual width from SOURCE CREATIVE before choosing font-size.
- Do not rely on accidental browser auto-wrapping for important text. Match the original line breaks intentionally.
- For single-line text blocks, use a dedicated absolutely positioned element with explicit width and white-space: nowrap.
- For multi-line text blocks, use explicit <br> line breaks or separate absolutely positioned line elements. Do not let the browser decide unexpected wrap points.
- If a line is likely to wrap at the chosen width, reduce font-size before returning the HTML. Prefer smaller text over unexpected wrapping.
- If text almost fits but is slightly too wide, you may reduce letter-spacing to make letters sit closer together, but only within reasonable visual limits and only if it still looks like the source creative.
- If the new hook needs two lines, plan those two lines explicitly and set line-height small enough to fit the original hook area without colliding with the next block.
- Avoid putting a long paragraph into one narrow div and hoping it wraps correctly. Split it into stable visual lines.
- Estimate the vertical and horizontal spacing between text groups from SOURCE CREATIVE. Preserve those gaps as closely as possible.
- If you cannot estimate spacing exactly, prefer moderate/smaller gaps. Do not create very large empty gaps between related text groups.
- Content bounds are as important as the start position. For every text section, estimate both where it starts and where it ends in SOURCE CREATIVE.
- Keep each text section inside its original visual bounding area: same approximate top, left, right edge, and bottom edge.
- Do not place text correctly at the start but let it finish much lower or wider than the original.
- If content would finish outside its original area because spacing is too large, reduce internal gaps/margins between lines and groups first.
- Only after reducing excessive gaps should you reduce font-size or line-height.
- Going outside the original visual area is the last resort, and only by a small amount if there is no other reliable option.
- Do not change CTA or body copy when only the hook should change.
- Do not recreate complex curved, warped, textPath, or decorative SVG text effects if they are risky.
- If a text effect is hard to reproduce reliably with HTML/CSS, simplify it into clean straight text while preserving hierarchy, size, weight, color, and position as closely as possible.
- Reliability is more important than decorative complexity.

If the new hook is longer and does not fit:
1. reduce font-size slightly
2. then reduce letter-spacing slightly if the original style allows tighter tracking
3. then adjust line-height slightly
4. then add a line break if needed
5. but do not move unrelated blocks or break the layout

Overlap prevention is mandatory:
- Before returning, mentally check every text block against neighboring blocks.
- Text must never visually sit on top of other text.
- Most overlap comes from text being too large for its available width and wrapping unexpectedly. Prevent this by manually controlling line breaks and reducing font-size early.
- If overlap would happen because vertical spacing is too large, first reduce the largest vertical gaps between text groups.
- If overlap would happen because text is too large or wrapping unexpectedly, reduce the font sizes proportionally across the whole text layout.
- If still needed, reduce only the most problematic large text blocks.
- Never solve overlap by letting one text block cover another.

Return JSON with exactly one field:
{
  "res": "<!DOCTYPE html>..."
}

The res value must be one complete static HTML document that can be rendered directly in iframe srcDoc.
Return only valid JSON matching the schema.`;
}

function toDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function saveGeneratedHtml(html: string) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("No HTML returned from model");
  }

  const generatedDir = join(process.cwd(), "public", "generated", "variations");
  await mkdir(generatedDir, { recursive: true });

  const filename = `${Date.now()}.html`;
  await writeFile(join(generatedDir, filename), html, "utf8");

  return `/generated/variations/${filename}`;
}
