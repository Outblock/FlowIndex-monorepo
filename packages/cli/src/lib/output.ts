export function formatKeyValue(pairs: [string, string][]): string {
  const maxKeyLen = Math.max(...pairs.map(([k]) => k.length));
  return pairs
    .map(([key, value]) => `  ${key.padEnd(maxKeyLen + 2)}${value}`)
    .join('\n');
}

export function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return 'No results.';
  }

  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );

  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join('  ');
  const separator = colWidths.map((w) => '-'.repeat(w)).join('  ');
  const dataLines = rows.map((row) =>
    row.map((cell, i) => (cell ?? '').padEnd(colWidths[i])).join('  '),
  );

  return [headerLine, separator, ...dataLines].join('\n');
}

export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function formatOutput(
  data: unknown,
  format: 'table' | 'json' | 'csv' = 'table',
): string {
  if (format === 'json') {
    return formatJson(data);
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, unknown>);
    const pairs: [string, string][] = entries.map(([k, v]) => [k, String(v)]);
    return formatKeyValue(pairs);
  }

  if (Array.isArray(data) && data.length > 0) {
    const headers = Object.keys(data[0]);
    const rows = data.map((item) => headers.map((h) => String(item[h] ?? '')));
    return formatTable(headers, rows);
  }

  return formatJson(data);
}
