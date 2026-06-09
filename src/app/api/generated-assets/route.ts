import { mkdir, readdir, stat } from "fs/promises";
import { join, relative } from "path";

export const maxDuration = 60;

type GeneratedAsset = {
  path: string;
  size: number;
  updatedAt: string;
}

export async function GET() {
  const generatedDir = join(process.cwd(), "public", "generated");

  await mkdir(generatedDir, { recursive: true });
  const files = await listFiles(generatedDir, generatedDir);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  return Response.json({
    count: files.length,
    totalSize,
    files,
  });
}

async function listFiles(rootDir: string, currentDir: string): Promise<GeneratedAsset[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        return listFiles(rootDir, fullPath);
      }

      if (!entry.isFile()) return [];

      const info = await stat(fullPath);
      return [{
        path: `/generated/${relative(rootDir, fullPath).replace(/\\/g, "/")}`,
        size: info.size,
        updatedAt: info.mtime.toISOString(),
      }];
    }),
  );

  return nested.flat().sort((a, b) => a.path.localeCompare(b.path));
}
