export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return base || 'club';
}

/**
 * Uzbek phone validation. Accepts common formats:
 *   +998901234567, 998901234567, 901234567, +998 (90) 123-45-67
 * Returns normalized +998XXXXXXXXX or null.
 */
export function normalizeUzPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  let core: string;
  if (digits.startsWith('+998')) {
    core = digits.slice(4);
  } else if (digits.startsWith('998') && digits.length === 12) {
    core = digits.slice(3);
  } else if (digits.length === 9) {
    core = digits;
  } else {
    return null;
  }
  if (!/^[3789]\d{8}$/.test(core)) {
    // Uzbek mobile prefixes start with 9 (and legacy 3/7/8 exist); keep permissive on first digit
    if (!/^\d{9}$/.test(core)) return null;
  }
  return `+998${core}`;
}
