export enum ScrapeStatus {
  Failure = 0,
  Success = 1,
  ActionRequired = 2,
}

export enum ProcessingStatus {
  Processed = 2,
  Error = 3,
}

export type ScrapeData = {
  brazilianTaxId: string;
  scrapedAt: string;
  source: string;
  payload: Record<string, unknown>;
};

export type ScrapeResult<T = ScrapeData> = {
  success: boolean;
  data: T | null;
  errorCode: string | null;
  errorMessage: string | null;
  status: ScrapeStatus;
  processingStatus: ProcessingStatus;
};

export type CertificateType =
  | "NEGATIVE"
  | "POSITIVE"
  | "POSITIVE-WITH-NEGATIVE-EFFECTS";

export type CertificateData = {
  certificateType: CertificateType;
  controlCode?: string;
  certificateCode?: string;
  issuedAt?: string;
  validUntil?: string;
  file?: {
    content: string;
  };
};
