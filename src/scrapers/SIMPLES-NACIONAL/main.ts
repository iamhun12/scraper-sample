import puppeteer, { Browser, Page } from "puppeteer";
import { z } from "zod";
import { Scraper } from "@/common/ports/scraper";
import type { ScrapeData } from "@/common/types";
import {
  formatBrazilianTaxId,
  isValidBrazilianTaxId,
  stripBrazilianTaxId,
} from "@/common/utils";
import { InvalidInputError, PortalUnavailableError } from "@/common/errors";

const inputSchema = z
  .object({
    source: z.object({
      id: z.literal("SIMPLES-NACIONAL"),
    }),
    brazilianTaxId: z.string().nonempty(),
    headless: z.boolean().optional().default(true),
  })
  .refine((data) => isValidBrazilianTaxId(data.brazilianTaxId), {
    message: "Invalid Brazilian tax ID",
    path: ["brazilianTaxId"],
  });

type Input = z.output<typeof inputSchema>;

export default class SimplesNacionalScraper extends Scraper<Input> {
  public readonly id = "SIMPLES-NACIONAL";
  public readonly inputSchema = inputSchema;

  public async run(input: Input): Promise<ScrapeData> {
    const brazilianTaxId = stripBrazilianTaxId(input.brazilianTaxId);

    if (brazilianTaxId.length !== 14) {
      throw new InvalidInputError("Brazilian tax ID must have 14 digits");
    }

    const browser = await puppeteer.launch({
      headless: input.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const payload = await this.scrape(browser, brazilianTaxId);

      return {
        brazilianTaxId: formatBrazilianTaxId(brazilianTaxId),
        scrapedAt: new Date().toISOString(),
        source: this.id,
        payload,
      };
    } finally {
      await browser.close();
    }
  }

  private async scrape(
    browser: Browser,
    brazilianTaxId: string,
  ): Promise<Record<string, unknown>> {
    const page: Page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    );

    const url = `https://publica.cnpj.ws/cnpj/${brazilianTaxId}`;

    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });

      if (!response || response.status() >= 500) {
        throw new PortalUnavailableError(
          `Portal returned status ${response?.status()}`,
        );
      }

      if (response.status() === 404) {
        throw new InvalidInputError("Brazilian tax ID not found");
      }

      await page.waitForSelector("body", { timeout: 10_000 });

      return await page.evaluate(() => {
        const text = (sel: string) =>
          document.querySelector(sel)?.textContent?.trim() ?? null;

        return {
          pageTitle: document.title,
          legalName: text("h1") ?? text("h2"),
          rawContent: document.body.innerText.slice(0, 500),
        };
      });
    } catch (err) {
      if (err instanceof InvalidInputError) throw err;
      throw new PortalUnavailableError(
        err instanceof Error ? err.message : "Unknown portal error",
      );
    } finally {
      await page.close();
    }
  }
}
