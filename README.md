

https://github.com/user-attachments/assets/09be1f07-b805-494e-a21e-0dcf1f4525f9



https://github.com/user-attachments/assets/3c66fc8f-24f7-4854-a395-bc8a8104420d



https://github.com/user-attachments/assets/4c0a282e-4f1c-4c71-b3ec-7348ae2e4f5e

# scraper-sample

Minimal sample of a Brazilian-tax-ID-based scraping pipeline (CNPJ — the
14-digit corporate tax identifier issued by Receita Federal). Demonstrates a
typed JSON in/out contract, Zod-validated parameters, and a pluggable scraper
module loaded dynamically by an `id`.

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

| ID        | Strategy   | Target                                                          |
| --------- | ---------- | --------------------------------------------------------------- |
| `CADINGO` | puppeteer  | SEFAZ-GO CND portal: fills form, intercepts PDF, parses fields  |
| `CNDAL`   | axios HTTP | SEFAZ-AL certificate API: posts JSON, parses returned PDF       |

## I/O contract

**Input** (`request/parameters.cadingo.json`):

```json
{
  "source": { "id": "CADINGO" },
  "brazilianTaxId": "29736089000807",
  "headless": false
}
```

**Output** (`result/result.json`):

```json
{
  "success": true,
  "data": {
    "brazilianTaxId": "29.736.089/0008-07",
    "scrapedAt": "2026-05-07T03:35:05.266Z",
    "source": "CADINGO",
    "payload": {
      "certificateType": "NEGATIVE",
      "certificateCode": "202601063686",
      "issuedAt": "2026-05-07T00:34:52.000Z",
      "validUntil": "2026-06-06T00:34:52.000Z",
      "file": { "content": "<base64 PDF>" }
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
npm start -- -f parameters.cadingo.json   # SEFAZ-GO via puppeteer
npm start -- -f parameters.cndal.json     # SEFAZ-AL via axios
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
    types/         ScrapeResult, ScrapeData, CertificateData, status enums
    utils/         brazilianTaxId format/validate, IO paths, param loader, output writer, dynamic loader, PDF text, dates, cookies
  scrapers/
    CADINGO/main.ts   (puppeteer)
    CNDAL/main.ts     (axios)
request/
result/
```
