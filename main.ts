import { join } from "node:path";
import { z } from "zod";

import {
  getIOPaths,
  loadParameters,
  loadScraper,
  writeOutput,
} from "@/common/utils";
import { ScraperError } from "@/common/errors";
import {
  ProcessingStatus,
  ScrapeStatus,
  type ScrapeResult,
} from "@/common/types";

const baseInputSchema = z.object({
  source: z.object({
    id: z.string().nonempty(),
  }),
  brazilianTaxId: z.string().nonempty(),
});

async function main(): Promise<void> {
  const { inputDir, inputFile, outputDir } = getIOPaths();
  const rawParams = loadParameters(join(inputDir, inputFile));

  let result: ScrapeResult;

  try {
    const base = baseInputSchema.parse(rawParams);
    const scraper = await loadScraper(base.source.id);
    const input = scraper.inputSchema.parse(rawParams);

    const data = await scraper.run(input);

    result = {
      success: true,
      data,
      errorCode: null,
      errorMessage: null,
      status: ScrapeStatus.Success,
      processingStatus: ProcessingStatus.Processed,
    };
  } catch (err) {
    result = buildErrorResult(err);
  }

  await writeOutput(result, outputDir);
  console.log(JSON.stringify(result, null, 2));
}

function buildErrorResult(err: unknown): ScrapeResult {
  if (err instanceof z.ZodError) {
    return {
      success: false,
      data: null,
      errorCode: "1020",
      errorMessage: err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
      status: ScrapeStatus.Failure,
      processingStatus: ProcessingStatus.Error,
    };
  }

  if (err instanceof ScraperError) {
    return {
      success: false,
      data: null,
      errorCode: err.code,
      errorMessage: err.message,
      status: ScrapeStatus.Failure,
      processingStatus: ProcessingStatus.Error,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    success: false,
    data: null,
    errorCode: "800",
    errorMessage: message,
    status: ScrapeStatus.Failure,
    processingStatus: ProcessingStatus.Error,
  };
}

process.on("uncaughtException", (reason) => {
  console.error("uncaughtException", reason);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection", reason);
  process.exit(1);
});

main();
