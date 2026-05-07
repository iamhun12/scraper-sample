import type { z } from "zod";
import type { ScrapeData } from "@/common/types";

export abstract class Scraper<TInput> {
  public abstract readonly id: string;
  public abstract readonly inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;

  public abstract run(input: TInput): Promise<ScrapeData>;
}

export type ScraperConstructor = new () => Scraper<unknown>;
