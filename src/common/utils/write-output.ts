import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScrapeResult } from "@/common/types";

export async function writeOutput(
  result: ScrapeResult,
  outputDir: string,
): Promise<void> {
  await writeFile(
    join(outputDir, "result.json"),
    JSON.stringify(result, null, 2),
  );
}
