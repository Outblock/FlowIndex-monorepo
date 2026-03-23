import { FlowIndexApiError } from '@flowindex/api-client';

export function withErrorHandling<T extends (...args: any[]) => Promise<void>>(
  handler: T,
): (...args: Parameters<T>) => Promise<void> {
  return async (...args: Parameters<T>) => {
    try {
      await handler(...args);
    } catch (err) {
      if (err instanceof FlowIndexApiError) {
        if (err.status === 404) {
          console.error('Not found. Check the address, transaction hash, or block height.');
        } else if (err.status === 429) {
          console.error('Rate limited. Try again in a moment, or use `flowindex auth login` for higher limits.');
        } else {
          console.error(`API error (${err.status}): ${err.message}`);
        }
      } else if (err instanceof Error) {
        console.error(`Error: ${err.message}`);
      } else {
        console.error('An unexpected error occurred.');
      }
      process.exit(1);
    }
  };
}
