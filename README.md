# scraper-sample

Minimal sample of a CNPJ-based scraping pipeline. Demonstrates a typed JSON
in/out contract, Zod-validated parameters, and a pluggable scraper module
loaded dynamically by an `id`.

This is a small extract of the architecture used in a larger production
scraper farm — trimmed to focus on the core ideas and showcase two
common scraping strategies side-by-side.

## Architecture

```
request/parameters.json  ──►  main.ts  ──►  result/result.json
                                  │
                                  ├── validates input (Zod, base + per-scraper)
                                  ├── resolves scraper by source.id
                                  └── runs scraper.run(input) and serializes
```

Each scraper lives under `src/scrapers/<ID>/main.ts` and exports a default
class extending `Scraper<Input>`. The `source.id` field on the parameters
file selects which scraper runs.

## Scrapers included

| ID                  | Strategy   | Target                                                |
| ------------------- | ---------- | ----------------------------------------------------- |
| `RECEITA-FEDERAL`   | axios HTTP | BrasilAPI public CNPJ endpoint (no auth)              |
| `SIMPLES-NACIONAL`  | puppeteer  | Renders `publica.cnpj.ws` and extracts page content   |

## I/O contract

**Input** (`request/parameters.json`):

```json
{
  "source": { "id": "RECEITA-FEDERAL" },
  "cnpj": "29.736.089/0008-07"
}
```

**Output** (`result/result.json`):

```json
{
  "success": true,
  "data": {
    "cnpj": "29.736.089/0008-07",
    "scrapedAt": "2026-05-06T12:00:00.000Z",
    "source": "RECEITA-FEDERAL",
    "payload": {
      "legalName": "...",
      "registrationStatus": "ATIVA",
      "openingDate": "2008-03-12"
    }
  },
  "errorCode": null,
  "errorMessage": null,
  "status": 1,
  "processingStatus": 2
}
```

On failure, `success` is `false`, `data` is `null`, and `errorCode` /
`errorMessage` describe the cause (validation, portal error, unknown).

## Run

```bash
npm install
npm start                                       # uses request/parameters.json
npm start -- -f parameters.simples.json         # runs the puppeteer scraper
```

CLI flags:
- `-f, --inputFile`  parameter file name (default `parameters.json`)
- `-i, --inputDir`   input directory (default `./request`)
- `-o, --outputDir`  output directory (default `./result`)

## Adding a new scraper

1. Create `src/scrapers/<ID>/main.ts`.
2. Define a Zod `inputSchema` with a literal `source.id`.
3. Export a default class extending `Scraper<Input>` implementing `run(input)`.
4. Reference the new `id` in your `parameters.json`.

The loader at [src/common/utils/load-scraper.ts](src/common/utils/load-scraper.ts)
imports the file dynamically — no central registry to update.

## Layout

```
main.ts
src/
  common/
    errors/        ScraperError + typed subclasses (codes preserved)
    ports/         Scraper abstract base
    types/         ScrapeResult, ScrapeData, status enums
    utils/         CNPJ format/validate, IO paths, param loader, output writer, dynamic loader
  scrapers/
    RECEITA-FEDERAL/main.ts   (axios)
    SIMPLES-NACIONAL/main.ts  (puppeteer)
request/
result/
```
