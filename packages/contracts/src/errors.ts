export type FieldError = {
  field: string;
  messageKey: string;
};

export type ApiError = {
  code: string;
  messageKey: string;
  correlationId: string;
  fieldErrors: FieldError[];
};

export class DomainTransitionError extends Error {
  constructor(
    public readonly aggregate: string,
    public readonly from: string,
    public readonly command: string,
  ) {
    super(`Invalid ${aggregate} transition: ${from} -> ${command}`);
    this.name = 'DomainTransitionError';
  }
}
