import axios, { AxiosInstance } from "axios";
import axiosRetry from "axios-retry";
import { getDocument } from "pdfjs-dist";
import { z } from "zod";

import { Scraper } from "@/common/ports/scraper";
import type {
  CertificateData,
  CertificateType,
  ScrapeData,
} from "@/common/types";
import {
  CookieJar,
  cookiesRequestInterceptor,
  cookiesResponseInterceptor,
  formatBrazilianTaxId,
  getDefaultDates,
  getPDFText,
  isValidBrazilianTaxId,
  parseBrazilianDate,
  stripBrazilianTaxId,
} from "@/common/utils";
import {
  InvalidInputError,
  PortalUnavailableError,
  ScraperError,
} from "@/common/errors";
import { DocumentType, IssueCertificate } from "./types";

const BASE_URL = "https://contribuinte.sefaz.al.gov.br";

const inputSchema = z
  .object({
    source: z.object({
      id: z.literal("CNDAL"),
      validityDays: z.number().positive(),
    }),
    brazilianTaxId: z.string().nonempty(),
    proxy: z.string().url().optional().nullable(),
  })
  .refine((data) => isValidBrazilianTaxId(data.brazilianTaxId), {
    message: "Invalid Brazilian tax ID",
    path: ["brazilianTaxId"],
  });

type Input = z.output<typeof inputSchema>;

export default class CndalScraper extends Scraper<Input> {
  public readonly id = "CNDAL";
  public readonly inputSchema = inputSchema;

  public async run(input: Input): Promise<ScrapeData> {
    const taxId = stripBrazilianTaxId(input.brazilianTaxId);

    if (taxId.length !== 14) {
      throw new InvalidInputError("Brazilian tax ID must have 14 digits");
    }

    const api = this.makeApi(input.proxy ?? null);
    const certificate = await this.fetchCertificate(
      api,
      taxId,
      input.source.validityDays,
    );

    return {
      brazilianTaxId: formatBrazilianTaxId(taxId),
      scrapedAt: new Date().toISOString(),
      source: this.id,
      payload: certificate as unknown as Record<string, unknown>,
    };
  }

  private makeApi(proxy: string | null): AxiosInstance {
    const jar: CookieJar = {};

    const api = axios.create({
      timeout: 300_000,
      baseURL: BASE_URL,
      headers: {
        common: {
          Accept:
            "text/html,application/json,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en-US,en;q=0.7",
          Origin: BASE_URL,
          Host: "contribuinte.sefaz.al.gov.br",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64; rv:148.0) Gecko/20100101 Firefox/148.0",
        },
        post: { "Content-Type": "application/json" },
      },
      timeoutErrorMessage: "Portal slow",
    });

    if (proxy) {
      const [auth, host] = proxy.split("@");
      const [user, password] = auth.split(":");
      const [ip, port] = host.split(":");
      api.defaults.proxy = {
        host: ip,
        port: parseInt(port),
        auth: { username: user, password },
        protocol: "http",
      };
    }

    axiosRetry(api);
    cookiesRequestInterceptor(api, jar);
    cookiesResponseInterceptor(api, jar);

    return api;
  }

  private async fetchCertificate(
    api: AxiosInstance,
    taxId: string,
    validityDays: number,
  ): Promise<CertificateData> {
    console.log("Going to initial page...");

    await api.get("/certidao/#/emitircertidao").catch(() => {
      throw new PortalUnavailableError("Failed to load CNDAL portal");
    });

    console.log("Filling form...");
    const issued = await this.requestCertificate(api, taxId);

    if (!issued) {
      return {
        certificateType: "POSITIVE",
        ...getDefaultDates(validityDays),
      };
    }

    console.log("Parsing PDF...");
    return parseCertificatePdf(issued.conteudo);
  }

  private async requestCertificate(
    api: AxiosInstance,
    taxId: string,
  ): Promise<IssueCertificate.SuccessResponse | null> {
    const payload: IssueCertificate.Request = {
      tipoDocumento: DocumentType.CNPJ,
      numeroDocumento: taxId,
    };

    const response = await api.post<IssueCertificate.Response>(
      "/certidao/sfz-certidao-api/api/public/emitirCertidao",
      payload,
      {
        validateStatus: () => true,
        params: { cacheBuster: Date.now() },
      },
    );

    const errorMessage = extractErrorMessage(response.data);

    if (errorMessage && isPositiveCertificate(errorMessage)) {
      return null;
    }

    if (errorMessage) {
      throw new ScraperError("1500", `Portal returned error: ${errorMessage}`);
    }

    return response.data as IssueCertificate.SuccessResponse;
  }
}

function extractErrorMessage(data: IssueCertificate.Response): string | null {
  if (typeof data === "string") return null;
  if ("description" in data) return data.description;
  return null;
}

function isPositiveCertificate(message: string): boolean {
  return /n[aã]o\s+foi\s+poss[ií]vel\s+emitir\s+a\s+certid[aã]o/i.test(message);
}

async function parseCertificatePdf(
  base64Content: string,
): Promise<CertificateData> {
  const pdfBuffer = Buffer.from(base64Content, "base64");
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
    issuedAt: parseIssuedAt(pdfText).toISOString(),
    validUntil: parseValidUntil(pdfText).toISOString(),
    file: { content: pdfBuffer.toString("base64") },
  };
}

function parseCertificateType(text: string): CertificateType {
  const mappers: [RegExp, CertificateType][] = [
    [
      /Certid[ãa]o\s+Positiva\s+de\s+D[ée]bitos\s+de\s+Tributos\s+Estaduais\s+com\s+Efeitos\s+de\s+Negativa/i,
      "POSITIVE-WITH-NEGATIVE-EFFECTS",
    ],
    [/Certid[ãa]o\s+Negativa\s+de\s+D[ée]bitos/i, "NEGATIVE"],
  ];

  const found = mappers.find(([re]) => re.test(text));
  if (!found) {
    throw new ScraperError("1500", "certificateType not found in PDF");
  }
  return found[1];
}

function parseCertificateCode(text: string): string {
  const re = /(?<=C[óo]digo\s+de\s+controle\s+da\s+certid[ãa]o\s*:\s*)[\w\-]+/i;
  const match = re.exec(text);
  if (!match) {
    throw new ScraperError("1500", "certificateCode not found in PDF");
  }
  return match[0];
}

function parseIssuedAt(text: string): Date {
  const re =
    /(?<=Emitida\s+[àa]s\s+)(?<hour>\d{2}:\d{2}:\d{2})\s+do\s+dia\s+(?<day>\d{2})\/(?<month>\d{2})\/(?<year>\d{4})/i;
  const match = re.exec(text);
  if (!match) {
    throw new ScraperError("1500", "issuedAt not found in PDF");
  }
  const { year, month, day, hour } = match.groups!;
  return new Date(`${year}-${month}-${day}T${hour}Z`);
}

function parseValidUntil(text: string): Date {
  const re = /(?<=v[áa]lida\s+at[eé]\s+)\d{2}\/\d{2}\/\d{4}/i;
  const match = re.exec(text);
  if (!match) {
    throw new ScraperError("1500", "validUntil not found in PDF");
  }
  return parseBrazilianDate(match[0]);
}
