export class FlowIndexApiError extends Error {
  override name = 'FlowIndexApiError';

  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(`FlowIndex API error ${status}: ${message}`);
  }
}
