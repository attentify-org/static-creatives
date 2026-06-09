const CREATIVES_API_BASE_URL = "https://stage.api.attainify.dev";

export type UploadedCreativeAsset = {
  assetId: string;
  url: string;
  key: string;
  contentType: string;
};

export async function uploadCreativeAsset(
  buffer: Buffer,
  filename: string,
  contentType: string,
) {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: contentType }),
    filename,
  );

  const response = await fetch(`${CREATIVES_API_BASE_URL}/creatives/upload`, {
    method: "POST",
    body: formData,
  });

  const payload = await readJsonResponse<UploadedCreativeAsset>(response);
  if (!payload.assetId || !payload.url) {
    throw new Error("Backend upload returned an invalid asset response");
  }

  return payload;
}

export async function downloadCreativeAsset(assetId: string) {
  const response = await fetch(
    `${CREATIVES_API_BASE_URL}/creatives/${encodeURIComponent(assetId)}/download`,
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Backend asset download failed (${response.status}): ${body || response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const arrayBuffer = await response.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  };
}

async function readJsonResponse<T>(response: Response) {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Backend asset upload failed (${response.status}): ${text || response.statusText}`,
    );
  }

  if (!text.trim()) {
    throw new Error("Backend asset upload returned an empty response");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Backend asset upload returned non-JSON response: ${text}`);
  }
}
