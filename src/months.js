const MONTH_NUMBERS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function padded(year, month) {
  if (!year || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Month Sold as YYYY-MM.
 * The sheet year fills in when the cell is only a month, as in SHI's "8-August" or "1-January".
 * A value that already names a year, such as 2026-08, keeps that year.
 */
export function canonicalMonth(month, tabYear) {
  const text = String(month ?? "").trim();
  const sheetYear = /^\d{4}$/.test(String(tabYear ?? "")) ? String(tabYear) : null;
  if (!text) return null;

  let match = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(text);
  if (match) return padded(match[1], Number(match[2]));

  match = /^(\d{1,2})\s*[-/]\s*([A-Za-z]+)$/.exec(text);
  if (match) {
    const number = Number(match[1]);
    const named = MONTH_NUMBERS[match[2].toLowerCase()];
    if (named && number === named) return padded(sheetYear, named);
  }

  const namedOnly = MONTH_NUMBERS[text.toLowerCase()];
  if (namedOnly) return padded(sheetYear, namedOnly);

  match = /^([A-Za-z]+)\s*[-/ ]\s*(\d{4})$/.exec(text);
  if (match && MONTH_NUMBERS[match[1].toLowerCase()]) {
    return padded(match[2], MONTH_NUMBERS[match[1].toLowerCase()]);
  }

  match = /^(\d{1,2})\s*\/\s*(\d{4})$/.exec(text);
  if (match) return padded(match[2], Number(match[1]));

  return null;
}

/** Date Sold as YYYY-MM-DD. Accepts ISO dates and M/D/YYYY sheet dates. */
export function canonicalDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
  if (!match) return null;
  let year = Number(match[3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
