import { NextRequest } from "next/server";
import OpenAI, { toFile } from "openai";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File;
    const width = parseInt(formData.get("width") as string);
    const height = parseInt(formData.get("height") as string);

    if (!file) {
      return Response.json({ error: "No image provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const mimeType = file.type || "image/png";
    const { size, outputWidth, outputHeight } = getImageEditSize(width, height);

    // Send original image directly to edit endpoint — model sees actual pixels
    const imageFile = await toFile(
      new Blob([bytes], { type: mimeType }),
      "image.png",
      { type: mimeType },
    );

    const imageResponse = await openai.images.edit({
      model: "gpt-image-2",
      image: imageFile,
      prompt: `Remove all visible text, words, letters, numbers, logos made only of typography, and CTA labels from this advertising creative. Preserve the original composition, objects, lighting, colors, texture, shadows, empty areas, and aspect ratio. Return a clean background-only image at exactly ${outputWidth}x${outputHeight}px.`,
      size,
      quality: "medium",
      output_format: "png",
      n: 1,
    });

    const b64 = imageResponse.data?.[0]?.b64_json;
    if (!b64)
      return Response.json(
        { error: "No image returned from API" },
        { status: 500 },
      );
    const imageBuffer = Buffer.from(b64 as string, "base64");

    const generatedDir = join(process.cwd(), "public", "generated");
    await mkdir(generatedDir, { recursive: true });

    const filename = `${Date.now()}.png`;
    await writeFile(join(generatedDir, filename), imageBuffer);

    return Response.json({
      imagePath: `/generated/${filename}`,
      width: outputWidth,
      height: outputHeight,
      sourceWidth: width,
      sourceHeight: height,
    });
  } catch (err) {
    console.error("remove-text failed", err);
    return Response.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return "Failed to remove text from image";
}

function getImageEditSize(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { size: "1024x1024", outputWidth: 1024, outputHeight: 1024 };
  }

  const aspectRatio = width / height;
  let outputWidth = width;
  let outputHeight = height;

  if (aspectRatio > 3) {
    outputWidth = height * 3;
  } else if (aspectRatio < 1 / 3) {
    outputHeight = width * 3;
  }

  const maxPixels = 3840 * 2160;
  if (outputWidth * outputHeight > maxPixels) {
    const scale = Math.sqrt(maxPixels / (outputWidth * outputHeight));
    outputWidth *= scale;
    outputHeight *= scale;
  }

  outputWidth = roundToMultiple(outputWidth, 16);
  outputHeight = roundToMultiple(outputHeight, 16);

  return {
    size: `${outputWidth}x${outputHeight}`,
    outputWidth,
    outputHeight,
  };
}

function roundToMultiple(value: number, multiple: number) {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}
