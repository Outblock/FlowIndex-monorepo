import { describe, it, expect } from 'vitest';
import { FlowIndexApiError } from '../src/errors.js';

describe('FlowIndexApiError', () => {
  it('includes status and body in the error', () => {
    const err = new FlowIndexApiError(404, 'Not found', { detail: 'no such tx' });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.message).toBe('FlowIndex API error 404: Not found');
    expect(err.body).toEqual({ detail: 'no such tx' });
    expect(err.name).toBe('FlowIndexApiError');
  });

  it('works without body', () => {
    const err = new FlowIndexApiError(500, 'Internal Server Error');
    expect(err.status).toBe(500);
    expect(err.body).toBeUndefined();
  });
});
