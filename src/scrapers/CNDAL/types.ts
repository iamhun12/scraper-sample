export enum DocumentType {
  CNPJ = "CNPJ",
  CPF = "CPF",
}

export namespace IssueCertificate {
  export type Request = {
    tipoDocumento: DocumentType;
    numeroDocumento: string;
  };

  export type SuccessResponse = {
    conteudo: string;
  };

  export type ErrorResponse = {
    description: string;
  };

  export type Response = SuccessResponse | ErrorResponse | string;
}
