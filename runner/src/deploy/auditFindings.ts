export type Severity = 'high' | 'medium' | 'low' | 'info' | 'error' | 'warning';
export type AuditFindingSource = 'security' | 'typecheck' | 'best-practice' | 'ai-review';
export type AuditScore = 'A' | 'B' | 'C' | 'D' | 'F';

export interface AuditFinding {
  id: string;
  severity: Severity;
  line: number;
  startLine: number;
  endLine: number;
  column?: number;
  endColumn?: number;
  rule?: string;
  message: string;
  suggestion?: string;
  confidence?: number;
  source: AuditFindingSource;
  sources: AuditFindingSource[];
  evidenceCount: number;
}

export interface AuditResultData {
  findings: AuditFinding[];
  summary: string;
  score?: AuditScore;
}

const VALID_SEVERITIES = new Set<Severity>(['high', 'medium', 'low', 'info', 'error', 'warning']);
const VALID_SOURCES = new Set<AuditFindingSource>(['security', 'typecheck', 'best-practice', 'ai-review']);
const VALID_SCORES = new Set<AuditScore>(['A', 'B', 'C', 'D', 'F']);
const SOURCE_PRIORITY: AuditFindingSource[] = ['security', 'typecheck', 'ai-review', 'best-practice'];
const SEVERITY_RANK: Record<Severity, number> = {
  high: 0,
  error: 1,
  medium: 2,
  warning: 3,
  low: 4,
  info: 5,
};

type RawAuditFinding = Partial<{
  severity: string;
  line: number;
  startLine: number;
  endLine: number;
  column: number;
  endColumn: number;
  rule: string;
  message: string;
  suggestion: string;
  confidence: number;
  source: string;
  sources: string[];
}>;

function asPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const rounded = Math.trunc(value);
  return rounded > 0 ? rounded : undefined;
}

function normalizeMessageKey(message: string): string {
  return message.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function uniqueSources(values: AuditFindingSource[]): AuditFindingSource[] {
  return [...new Set(values)];
}

function normalizeSources(source: unknown, sources: unknown): AuditFindingSource[] {
  const normalized = [
    ...(Array.isArray(sources) ? sources : []),
    source,
  ].filter((value): value is AuditFindingSource => typeof value === 'string' && VALID_SOURCES.has(value as AuditFindingSource));

  return normalized.length > 0 ? uniqueSources(normalized) : ['ai-review'];
}

function primarySource(sources: AuditFindingSource[]): AuditFindingSource {
  return SOURCE_PRIORITY.find((candidate) => sources.includes(candidate)) || sources[0] || 'ai-review';
}

function clampConfidence(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function informativeText(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.trim().length > a.trim().length ? b : a;
}

function mergeOptionalMin(a?: number, b?: number): number | undefined {
  if (typeof a === 'number' && typeof b === 'number') return Math.min(a, b);
  return a ?? b;
}

function mergeOptionalMax(a?: number, b?: number): number | undefined {
  if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b);
  return a ?? b;
}

function normalizeFinding(input: unknown, index: number): AuditFinding | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as RawAuditFinding;
  if (typeof raw.message !== 'string' || raw.message.trim().length === 0) return null;

  const startLine = asPositiveInt(raw.startLine) ?? asPositiveInt(raw.line);
  if (!startLine) return null;

  const endLine = Math.max(startLine, asPositiveInt(raw.endLine) ?? startLine);
  const severity = typeof raw.severity === 'string' && VALID_SEVERITIES.has(raw.severity as Severity)
    ? raw.severity as Severity
    : 'info';
  const sources = normalizeSources(raw.source, raw.sources);

  return {
    id: `audit-finding-${index}`,
    severity,
    line: startLine,
    startLine,
    endLine,
    column: asPositiveInt(raw.column),
    endColumn: asPositiveInt(raw.endColumn),
    rule: typeof raw.rule === 'string' && raw.rule.trim() ? raw.rule.trim() : undefined,
    message: raw.message.trim(),
    suggestion: typeof raw.suggestion === 'string' && raw.suggestion.trim() ? raw.suggestion.trim() : undefined,
    confidence: clampConfidence(raw.confidence),
    source: primarySource(sources),
    sources,
    evidenceCount: 1,
  };
}

function findingCanMerge(a: AuditFinding, b: AuditFinding): boolean {
  const messageKeyA = normalizeMessageKey(a.message);
  const messageKeyB = normalizeMessageKey(b.message);
  const sameRule = !!a.rule && !!b.rule && a.rule === b.rule;
  const sameMessage = messageKeyA.length > 0 && messageKeyA === messageKeyB;
  const overlappingRange = a.startLine <= (b.endLine + 1) && b.startLine <= (a.endLine + 1);

  return overlappingRange && (sameRule || sameMessage);
}

function mergeSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

function mergeFindings(a: AuditFinding, b: AuditFinding): AuditFinding {
  const sources = uniqueSources([...a.sources, ...b.sources]);

  return {
    ...a,
    severity: mergeSeverity(a.severity, b.severity),
    line: Math.min(a.startLine, b.startLine),
    startLine: Math.min(a.startLine, b.startLine),
    endLine: Math.max(a.endLine, b.endLine),
    column: mergeOptionalMin(a.column, b.column),
    endColumn: mergeOptionalMax(a.endColumn, b.endColumn),
    rule: a.rule || b.rule,
    message: informativeText(a.message, b.message) || a.message,
    suggestion: informativeText(a.suggestion, b.suggestion),
    confidence: mergeOptionalMax(a.confidence, b.confidence),
    source: primarySource(sources),
    sources,
    evidenceCount: a.evidenceCount + b.evidenceCount,
  };
}

export function normalizeAuditResult(input: unknown): AuditResultData | null {
  if (!input || typeof input !== 'object') return null;

  const payload = input as Partial<{
    findings: unknown[];
    summary: string;
    score: string;
  }>;

  if (!Array.isArray(payload.findings)) return null;

  const normalized = payload.findings
    .map((finding, index) => normalizeFinding(finding, index))
    .filter((finding): finding is AuditFinding => finding != null);

  const merged: AuditFinding[] = [];
  for (const finding of normalized) {
    const existingIndex = merged.findIndex((candidate) => findingCanMerge(candidate, finding));
    if (existingIndex >= 0) {
      merged[existingIndex] = mergeFindings(merged[existingIndex], finding);
    } else {
      merged.push(finding);
    }
  }

  merged.sort((a, b) => (
    a.startLine - b.startLine ||
    a.endLine - b.endLine ||
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  ));

  const findings = merged.map((finding, index) => ({
    ...finding,
    id: `finding-${index}`,
    line: finding.startLine,
  }));

  const score = typeof payload.score === 'string'
    ? payload.score.trim().toUpperCase()
    : undefined;

  return {
    findings,
    summary: typeof payload.summary === 'string' ? payload.summary.trim() : '',
    score: score && VALID_SCORES.has(score as AuditScore) ? score as AuditScore : undefined,
  };
}

export function formatFindingLineRange(finding: Pick<AuditFinding, 'startLine' | 'endLine'>): string {
  return finding.startLine === finding.endLine
    ? `L${finding.startLine}`
    : `L${finding.startLine}-${finding.endLine}`;
}

export function findingMatchesLine(finding: Pick<AuditFinding, 'startLine' | 'endLine'>, line: number): boolean {
  return line >= finding.startLine && line <= finding.endLine;
}

export function compareFindingSeverity(a: Pick<AuditFinding, 'severity'>, b: Pick<AuditFinding, 'severity'>): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
}
