import type { AuditFinding } from './auditFindings';

export interface PositionedAuditFinding {
  finding: AuditFinding;
  top: number;
  height: number;
}

export function computeSidebarLayout(
  findings: AuditFinding[],
  cardHeights: Record<string, number>,
  lineHeight: number,
  defaultHeight: number = 72,
  gap: number = 4,
): { items: PositionedAuditFinding[]; contentHeight: number } {
  if (findings.length === 0) return { items: [], contentHeight: 0 };

  const items: PositionedAuditFinding[] = [];
  let lastBottom = -Infinity;

  for (const finding of findings) {
    const height = cardHeights[finding.id] ?? defaultHeight;
    const idealTop = (finding.startLine - 1) * lineHeight;
    const top = Math.max(idealTop, lastBottom + gap);
    items.push({ finding, top, height });
    lastBottom = top + height;
  }

  return {
    items,
    contentHeight: Math.max(0, lastBottom),
  };
}
