import { NextRequest } from "next/server";
import { toFile } from "openai";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join, normalize } from "path";
import { createOpenAIClient, openAIConfigurationError } from "@/lib/openai";

export const maxDuration = 120;

type BackgroundMode = "light" | "medium" | "strong";

type TemplateLayout = {
  blocks?: Array<{
    id?: string;
    role?: string;
    text?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }>;
};

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const sourceFile = formData.get("sourceImage") as File | null;
  const cleanImagePath = formData.get("cleanImagePath") as string | null;
  const width = parseDimension(formData.get("width"));
  const height = parseDimension(formData.get("height"));
  const mode = normalizeMode(formData.get("mode"));
  const userPrompt = normalizeUserPrompt(formData.get("userPrompt"));
  const templateLayout = parseTemplateLayout(formData.get("templateLayout"));

  if (!sourceFile) {
    return Response.json({ error: "No source image provided" }, { status: 400 });
  }

  if (!cleanImagePath) {
    return Response.json({ error: "No clean image path provided" }, { status: 400 });
  }

  if (!width || !height) {
    return Response.json({ error: "Invalid canvas size" }, { status: 400 });
  }

  const openai = createOpenAIClient();
  if (!openai) return openAIConfigurationError();

  const sourceBytes = await sourceFile.arrayBuffer();
  const sourceMimeType = sourceFile.type || "image/png";
  const cleanImageBuffer = await readGeneratedImage(cleanImagePath);

  const cleanImageFile = await toFile(
    new Blob([cleanImageBuffer], { type: "image/png" }),
    "clean-background.png",
    { type: "image/png" },
  );
  const sourceImageFile = await toFile(
    new Blob([sourceBytes], { type: sourceMimeType }),
    "source-creative.png",
    { type: sourceMimeType },
  );

  const imageResponse = await openai.images.edit({
    model: "gpt-image-2",
    image: [cleanImageFile, sourceImageFile],
    prompt: buildPrompt(mode, width, height, userPrompt, templateLayout),
    size: `${width}x${height}`,
    quality: "medium",
    output_format: "png",
    n: 1,
  });

  const b64 = imageResponse.data?.[0]?.b64_json;
  if (!b64) {
    return Response.json({ error: "No image returned from API" }, { status: 500 });
  }

  const imageBuffer = Buffer.from(b64, "base64");
  const generatedDir = join(process.cwd(), "public", "generated", "backgrounds");
  await mkdir(generatedDir, { recursive: true });

  const filename = `${Date.now()}-${mode}.png`;
  await writeFile(join(generatedDir, filename), imageBuffer);

  return Response.json({
    id: `background-${Date.now()}`,
    label: `Background ${mode}`,
    imagePath: `/generated/backgrounds/${filename}`,
    mode,
  });
}

function buildPrompt(
  mode: BackgroundMode,
  width: number,
  height: number,
  userPrompt: string,
  templateLayout: TemplateLayout | null,
) {
  const modeInstruction = {
    light:
      `LIGHT variation:
- Keep the same background concept, composition, decorative language, and overall mood.
- Make only small visible changes: subtle texture, lighting, color nuance, tiny decorative details, minor pattern variation.
- The result should feel like a close sibling of the original clean background, not a new design.`,
    medium:
      `MEDIUM variation:
- Keep the same broad concept and advertising category, but make a clearly new visual version inside that concept.
- You may significantly change colors, decorative shapes, pattern style, materials, lighting, borders, ornaments, depth, and background details.
- The result should be recognizably related to the original idea, but visibly different at first glance.
- Preserve the same text-safe zones and general readability structure.`,
    strong:
      `STRONG variation:
- Create a new background idea, not just a stronger version of the same background.
- You may change the visual concept, style direction, decorative system, color palette, shapes, environment, texture, lighting, depth, frame treatment, and overall art direction.
- It can be radically different from the original clean background, as long as it is still suitable for the same ad and the same editable text layout.
- The text-safe zones are non-negotiable: keep the areas where text appears clean, calm, and readable.
- Do not let the new background compete with or visually cover the text areas.`,
  }[mode];

  return `You are generating a text-free background variant for an advertising creative.

Input image 1 is the clean background with all text removed.
Input image 2 is the original source creative with text. Use it only to understand where text appears and which areas must remain clean and readable.

Current selected editable text boxes:
${formatTextSafeBoxes(templateLayout)}

${modeInstruction}

Additional user guidance:
${userPrompt ? JSON.stringify(userPrompt) : "None provided."}

Hard requirements:
- Return a background-only image at exactly ${width}x${height}px.
- Do not add any text, letters, numbers, labels, CTA text, logos made from typography, or typography-like marks.
- Preserve safe readable areas where text appears in the source creative.
- Keep the main text zones visually calm: avoid busy detail, high contrast clutter, faces, hands, objects, or patterns behind text areas.
- Preserve the overall aspect ratio and crop.
- Preserve the usable layout structure for the existing HTML text overlay.
- Keep the image suitable for overlaying the existing editable HTML text layout.
- Do not move important decorative elements into text areas.
- Treat Current selected editable text boxes as the most important text-safe zones.
- Do not create fake UI buttons or fake captions.
- Treat Additional user guidance as visual direction only. Apply it when it is compatible with the source creative, selected variation mode, exact canvas size, text-safe zones, and no-text requirements.
- Additional user guidance must not override these hard requirements, request visible text, move clutter into text areas, change the canvas size, or make the result unsuitable for the existing HTML text overlay.
- For LIGHT mode, reliability and similarity are more important than novelty.
- For MEDIUM mode, visible variation is important, but the same broad concept should remain.
- For STRONG mode, novelty is important: avoid returning a near-duplicate of the original background, while still protecting text-safe areas.`;
}

async function readGeneratedImage(imagePath: string) {
  const publicDir = join(process.cwd(), "public");
  const normalizedPath = normalize(imagePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = join(publicDir, normalizedPath);

  if (!fullPath.startsWith(publicDir)) {
    throw new Error("Invalid clean image path");
  }

  return readFile(fullPath);
}

function parseDimension(value: FormDataEntryValue | null) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeMode(value: FormDataEntryValue | null): BackgroundMode {
  if (value === "light" || value === "medium" || value === "strong") return value;
  return "medium";
}

function normalizeUserPrompt(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 2000);
}

function parseTemplateLayout(value: FormDataEntryValue | null): TemplateLayout | null {
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value) as TemplateLayout;
    return {
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
    };
  } catch {
    return null;
  }
}

function formatTextSafeBoxes(layout: TemplateLayout | null) {
  const blocks = Array.isArray(layout?.blocks) ? layout.blocks : [];
  if (!blocks.length) return "No structured text boxes provided. Use input image 2 text zones.";

  return JSON.stringify(
    blocks.map((block) => ({
      id: block.id ?? "",
      role: block.role ?? "other",
      textPreview: typeof block.text === "string" ? block.text.slice(0, 80) : "",
      x: toFiniteNumber(block.x),
      y: toFiniteNumber(block.y),
      width: toFiniteNumber(block.width),
      height: toFiniteNumber(block.height),
    })),
    null,
    2,
  );
}

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
