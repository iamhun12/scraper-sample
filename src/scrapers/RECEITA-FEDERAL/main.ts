import axios, { AxiosError } from "axios";
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
      id: z.literal("RECEITA-FEDERAL"),
    }),
    brazilianTaxId: z.string().nonempty(),
  })
  .refine((data) => isValidBrazilianTaxId(data.brazilianTaxId), {
    message: "Invalid Brazilian tax ID",
    path: ["brazilianTaxId"],
  });

type Input = z.infer<typeof inputSchema>;

const apiPayloadSchema = z.object({
  cnpj: z.string(),
  razao_social: z.string().optional(),
  nome_fantasia: z.string().optional().nullable(),
  descricao_situacao_cadastral: z.string().optional(),
  data_inicio_atividade: z.string().optional(),
  cnae_fiscal_descricao: z.string().optional(),
  municipio: z.string().optional(),
  uf: z.string().optional(),
});

export default class ReceitaFederalScraper extends Scraper<Input> {
  public readonly id = "RECEITA-FEDERAL";
  public readonly inputSchema = inputSchema;

  public async run(input: Input): Promise<ScrapeData> {
    const brazilianTaxId = stripBrazilianTaxId(input.brazilianTaxId);

    if (brazilianTaxId.length !== 14) {
      throw new InvalidInputError("Brazilian tax ID must have 14 digits");
    }

    const payload = await this.fetch(brazilianTaxId);

    return {
      brazilianTaxId: formatBrazilianTaxId(brazilianTaxId),
      scrapedAt: new Date().toISOString(),
      source: this.id,
      payload,
    };
  }

  private async fetch(brazilianTaxId: string): Promise<Record<string, unknown>> {
    const url = `https://brasilapi.com.br/api/cnpj/v1/${brazilianTaxId}`;

    try {
      const { data } = await axios.get(url, {
        timeout: 15_000,
        headers: { "User-Agent": "scraper-sample/0.1" },
      });

      const parsed = apiPayloadSchema.parse(data);

      return {
        legalName: parsed.razao_social ?? null,
        tradeName: parsed.nome_fantasia ?? null,
        registrationStatus: parsed.descricao_situacao_cadastral ?? null,
        openingDate: parsed.data_inicio_atividade ?? null,
        primaryActivity: parsed.cnae_fiscal_descricao ?? null,
        city: parsed.municipio ?? null,
        state: parsed.uf ?? null,
      };
    } catch (err) {
      if (err instanceof AxiosError) {
        if (err.response?.status === 404) {
          throw new InvalidInputError(
            "Brazilian tax ID not found at Receita Federal",
          );
        }
        throw new PortalUnavailableError(
          `BrasilAPI request failed: ${err.message}`,
        );
      }
      throw err;
    }
  }
}
