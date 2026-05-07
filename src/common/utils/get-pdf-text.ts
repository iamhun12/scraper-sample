import type { PDFDocumentProxy } from "pdfjs-dist";

export async function getPDFText(doc: PDFDocumentProxy): Promise<string> {
  const parts: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(text);
  }

  return parts.join("\n");
}
