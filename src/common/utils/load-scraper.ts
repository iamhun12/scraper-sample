import { join } from "node:path";
import { existsSync } from "node:fs";
import type { Scraper } from "@/common/ports/scraper";

export async function loadScraper(id: string): Promise<Scraper<unknown>> {
  const scriptPath = join(__dirname, "..", "..", "scrapers", id, "main.ts");

  if (!existsSync(scriptPath)) {
    throw new Error(`Scraper "${id}" not found at ${scriptPath}`);
  }

  const mod = await import(scriptPath);
  const Ctor = mod.default;

  if (typeof Ctor !== "function") {
    throw new Error(`Scraper "${id}" does not export a default class`);
  }

  return new Ctor();
}
