import OpenAI from "openai";

export function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey ? new OpenAI({ apiKey }) : null;
}

export function openAIConfigurationError() {
  return Response.json(
    { error: "OPENAI_API_KEY is not configured" },
    { status: 500 },
  );
}
