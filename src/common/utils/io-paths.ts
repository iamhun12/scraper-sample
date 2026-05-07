import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

export type IOPaths = {
  inputFile: string;
  inputDir: string;
  outputDir: string;
};

export function getIOPaths(): IOPaths {
  const basePath = process.cwd();

  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      inputFile: { type: "string", default: "parameters.json", short: "f" },
      inputDir: { type: "string", default: join(basePath, "request"), short: "i" },
      outputDir: { type: "string", default: join(basePath, "result"), short: "o" },
    },
  });

  mkdirSync(values.outputDir!, { recursive: true });

  return values as IOPaths;
}
