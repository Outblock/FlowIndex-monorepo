import { describe, expect, it } from 'vitest';
import {
  compareFindingSeverity,
  findingMatchesLine,
  formatFindingLineRange,
  normalizeAuditResult,
} from './auditFindings';

describe('auditFindings', () => {
  it('normalizes line ranges, confidence, and score', () => {
    const result = normalizeAuditResult({
      findings: [
        {
          severity: 'medium',
          line: 12,
          endLine: 18,
          message: 'Missing slippage guard',
          confidence: 1.2,
          source: 'ai-review',
        },
      ],
      summary: 'Needs a tighter bound.',
      score: 'b',
    });

    expect(result).toEqual({
      findings: [
        expect.objectContaining({
          id: 'finding-0',
          line: 12,
          startLine: 12,
          endLine: 18,
          confidence: 1,
          source: 'ai-review',
          sources: ['ai-review'],
        }),
      ],
      summary: 'Needs a tighter bound.',
      score: 'B',
    });
  });

  it('dedupes overlapping findings and preserves multi-source evidence', () => {
    const result = normalizeAuditResult({
      findings: [
        {
          severity: 'warning',
          startLine: 27,
          endLine: 27,
          rule: 'overly-permissive-access',
          message: 'Struct fields are too permissive',
          source: 'security',
        },
        {
          severity: 'low',
          startLine: 27,
          endLine: 29,
          rule: 'overly-permissive-access',
          message: 'Struct fields are too permissive.',
          source: 'ai-review',
          confidence: 0.82,
        },
      ],
    });

    expect(result?.findings).toHaveLength(1);
    expect(result?.findings[0]).toEqual(
      expect.objectContaining({
        severity: 'warning',
        startLine: 27,
        endLine: 29,
        source: 'security',
        sources: ['security', 'ai-review'],
        evidenceCount: 2,
        confidence: 0.82,
      }),
    );
  });

  it('formats and matches line ranges', () => {
    expect(formatFindingLineRange({ startLine: 15, endLine: 15 })).toBe('L15');
    expect(formatFindingLineRange({ startLine: 15, endLine: 19 })).toBe('L15-19');
    expect(findingMatchesLine({ startLine: 15, endLine: 19 }, 17)).toBe(true);
    expect(findingMatchesLine({ startLine: 15, endLine: 19 }, 21)).toBe(false);
  });

  it('orders severities from most to least severe', () => {
    expect(compareFindingSeverity({ severity: 'high' }, { severity: 'medium' })).toBeLessThan(0);
    expect(compareFindingSeverity({ severity: 'info' }, { severity: 'warning' })).toBeGreaterThan(0);
  });
});
