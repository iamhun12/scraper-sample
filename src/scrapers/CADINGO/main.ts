import { setTimeout as sleep } from "node:timers/promises";
import axios from "axios";
import { getDocument } from "pdfjs-dist";
import puppeteer, { Browser, Page } from "puppeteer";
import { z } from "zod";

import { Scraper } from "@/common/ports/scraper";
import type {
  CertificateData,
  CertificateType,
  ScrapeData,
} from "@/common/types";
import {
  addDays,
  formatBrazilianTaxId,
  getPDFText,
  isValidBrazilianTaxId,
  stripBrazilianTaxId,
} from "@/common/utils";
import {
  InvalidInputError,
  PortalUnavailableError,
  ScraperError,
} from "@/common/errors";

const PORTAL_URL =
  "https://cdn-consultas.sefaz.go.gov.br/cdn-consultas/pendencia";

const inputSchema = z
  .object({
    source: z.object({
      id: z.literal("CADINGO"),
    }),
    brazilianTaxId: z.string().nonempty(),
    headless: z.boolean().optional().default(true),
  })
  .refine((data) => isValidBrazilianTaxId(data.brazilianTaxId), {
    message: "Invalid Brazilian tax ID",
    path: ["brazilianTaxId"],
  });

type Input = z.output<typeof inputSchema>;

export default class CadingoScraper extends Scraper<Input> {
  public readonly id = "CADINGO";
  public readonly inputSchema = inputSchema;

  public async run(input: Input): Promise<ScrapeData> {
    const taxId = stripBrazilianTaxId(input.brazilianTaxId);

    if (taxId.length !== 14) {
      throw new InvalidInputError("Brazilian tax ID must have 14 digits");
    }

    const browser = await puppeteer.launch({
      headless: input.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--window-size=1920,1080",
      ],
      defaultViewport: null,
    });

    try {
      const certificate = await this.fetchCertificate(browser, taxId);

      return {
        brazilianTaxId: formatBrazilianTaxId(taxId),
        scrapedAt: new Date().toISOString(),
        source: this.id,
        payload: certificate as unknown as Record<string, unknown>,
      };
    } finally {
      await browser.close();
    }
  }

  private async fetchCertificate(
    browser: Browser,
    taxId: string,
  ): Promise<CertificateData> {
    const page = await browser.newPage();

    console.log("Going to initial page...");

    try {
      await page.goto(PORTAL_URL, { waitUntil: "networkidle0" });
    } catch {
      throw new PortalUnavailableError("Portal slow or unreachable");
    }

    console.log("Filling form...");
    await this.fillForm(page, taxId);

    await page.waitForNetworkIdle();

    const pdfPagePromise = this.waitForPdfPage(browser);

    console.log("Generating PDF...");
    await page.click("#button-gerar");

    const pdfPage = await pdfPagePromise;
    const pdfBuffer = await this.capturePdf(pdfPage);

    return this.parseCertificate(pdfBuffer);
  }

  private async fillForm(page: Page, taxId: string): Promise<void> {
    await page.waitForSelector("#txtId");
    await page.type("#txtId", taxId, { delay: 100 });

    const captchaText = await page.$eval("#txtCaptcha", (el) => el.value);
    await page.type("#txtCaptchaDigitado", captchaText, { delay: 100 });

    await page.click("#consultar-pendencias-relatorio");
  }

  private waitForPdfPage(browser: Browser): Promise<Page> {
    return new Promise((resolve) => {
      browser.once("targetcreated", async (target) => {
        if (target.type() !== "page") return;
        const newPage = await target.page();
        if (newPage) resolve(newPage);
      });
    });
  }

  private async capturePdf(pdfPage: Page): Promise<Buffer> {
    let pdfBuffer: Buffer | null = null;

    await pdfPage.setRequestInterception(true);
    pdfPage.on("request", async (request) => {
      try {
        const response = await axios.request({
          url: request.url(),
          method: request.method(),
          responseType: "arraybuffer",
          headers: request.headers(),
          data: request.postData(),
          validateStatus: () => true,
          maxRedirects: 0,
        });

        pdfBuffer = Buffer.from(response.data);

        await request.respond({
          status: response.status,
          headers: response.headers as Record<string, string>,
          body: pdfBuffer,
        });
      } catch {
        await request.abort().catch(() => undefined);
      }
    });

    await pdfPage.reload();

    for (let i = 0; i < 10; i++) {
      if (pdfBuffer) return pdfBuffer;
      await sleep(3_000);
    }

    throw new PortalUnavailableError("PDF download timeout");
  }

  private async parseCertificate(pdfBuffer: Buffer): Promise<CertificateData> {
    let pdfText: string;

    try {
      const doc = await getDocument({
        data: Uint8Array.from(pdfBuffer),
        verbosity: 0,
      }).promise;
      pdfText = await getPDFText(doc);
    } catch {
      throw new ScraperError("1400", "Failed to parse PDF");
    }

    return {
      certificateType: parseCertificateType(pdfText),
      certificateCode: parseCertificateCode(pdfText),
      ...parseDates(pdfText),
      file: {
        content: pdfBuffer.toString("base64"),
      },
    };
  }
}

function parseCertificateType(text: string): CertificateType {
  const mappers: [RegExp, CertificateType][] = [
    [/N.o\sforam\sencontradas\spend.ncias/i, "NEGATIVE"],
    [/Foram\sencontradas\s\d+\spend.ncias/i, "POSITIVE"],
  ];

  const found = mappers.find(([re]) => re.test(text));
  if (!found) {
    throw new ScraperError("1500", "certificateType not found in PDF");
  }
  return found[1];
}

function parseCertificateCode(text: string): string {
  const re = /(?<=VALIDADOR\sDA\sDECLARA..O:\s)\S+/i;
  const match = re.exec(text);
  if (!match) {
    throw new ScraperError("1500", "certificateCode not found in PDF");
  }
  return match[0];
}

function parseDates(
  text: string,
): Pick<CertificateData, "issuedAt" | "validUntil"> {
  const re =
    /(?<day>\d{2})\/(?<month>\d{2})\/(?<year>\d{4})\D+(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})/;
  const match = re.exec(text);
  if (!match) {
    throw new ScraperError("1500", "issuedAt not found in PDF");
  }

  const { day, month, year, hour, minute, second } = match.groups!;
  const issued = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}Z`,
  );

  return {
    issuedAt: issued.toISOString(),
    validUntil: addDays(issued, 30).toISOString(),
  };
}
