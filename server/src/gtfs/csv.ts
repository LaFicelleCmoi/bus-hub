/**
 * Parseur CSV minimal conforme RFC 4180 (guillemets, guillemets doublés, sauts de ligne
 * dans les champs, CRLF, BOM). Suffisant pour les fichiers GTFS, sans dépendance.
 */
export function parseCsv(text: string): Record<string, string>[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift()?.map((h) => h.trim());
  if (!header) return [];

  const out: Record<string, string>[] = [];
  for (const r of rows) {
    if (r.length === 1 && r[0] === "") continue; // ligne vide
    const rec: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) rec[header[j]!] = (r[j] ?? "").trim();
    out.push(rec);
  }
  return out;
}
