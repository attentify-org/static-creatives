import type { NextRequest } from "next/server";
import { downloadCreativeAsset } from "@/lib/creative-assets";

export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/creative-assets/[assetId]/download">,
) {
  try {
    const { assetId } = await ctx.params;
    const asset = await downloadCreativeAsset(assetId);

    return new Response(new Uint8Array(asset.buffer), {
      headers: {
        "content-type": asset.contentType,
        "cache-control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("creative asset proxy download failed", err);
    return Response.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return "Failed to download creative asset";
}
