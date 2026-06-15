type CsvValue = string | number | boolean | null | undefined | Date;

function csvCell(value: CsvValue) {
  if (value === null || value === undefined) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const normalized = raw.replace(/\r?\n/g, ' ').replace(/"/g, '""');
  return `"${normalized}"`;
}

export function buildCsv(headers: string[], rows: CsvValue[][]) {
  return [
    headers.map(csvCell).join(','),
    ...rows.map(row => row.map(csvCell).join(',')),
  ].join('\r\n');
}

export function downloadCsv(filename: string, headers: string[], rows: CsvValue[][]) {
  const csv = buildCsv(headers, rows);
  // BOM makes Arabic/UTF-8 text open correctly in Microsoft Excel on Windows.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
