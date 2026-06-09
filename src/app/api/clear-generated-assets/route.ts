import { mkdir, readdir, rm } from "fs/promises";
import { join } from "path";

export const maxDuration = 60;

export async function POST() {
  const generatedDir = join(process.cwd(), "public", "generated");

  await mkdir(generatedDir, { recursive: true });
  const entries = await readdir(generatedDir, { withFileTypes: true });

  await Promise.all(
    entries.map((entry) => (
      rm(join(generatedDir, entry.name), { recursive: true, force: true })
    )),
  );

  return Response.json({ ok: true, deleted: entries.length });
}
