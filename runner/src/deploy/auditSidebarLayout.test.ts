import { describe, expect, it } from 'vitest';
import { computeSidebarLayout } from './auditSidebarLayout';
import type { AuditFinding } from './auditFindings';

function finding(id: string, startLine: number, endLine: number = startLine): AuditFinding {
  return {
    id,
    severity: 'low',
    line: startLine,
    startLine,
    endLine,
    message: id,
    source: 'ai-review',
    sources: ['ai-review'],
    evidenceCount: 1,
  };
}

describe('auditSidebarLayout', () => {
  it('anchors cards to their start line when they do not overlap', () => {
    const { items } = computeSidebarLayout(
      [finding('a', 1), finding('b', 10)],
      { a: 40, b: 40 },
      20,
      72,
      4,
    );

    expect(items).toEqual([
      expect.objectContaining({ top: 0 }),
      expect.objectContaining({ top: 180 }),
    ]);
  });

  it('pushes later cards down using their measured heights', () => {
    const { items, contentHeight } = computeSidebarLayout(
      [finding('a', 10), finding('b', 11), finding('c', 12)],
      { a: 120, b: 48, c: 64 },
      20,
      72,
      4,
    );

    expect(items.map((item) => item.top)).toEqual([180, 304, 356]);
    expect(contentHeight).toBe(420);
  });
});
