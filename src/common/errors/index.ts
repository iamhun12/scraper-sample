export class ScraperError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ScraperError";
    this.code = code;
  }
}

export class PortalUnavailableError extends ScraperError {
  constructor(message = "Portal unavailable") {
    super("1300", message);
    this.name = "PortalUnavailableError";
  }
}

export class InvalidInputError extends ScraperError {
  constructor(message = "Invalid parameters") {
    super("1020", message);
    this.name = "InvalidInputError";
  }
}
