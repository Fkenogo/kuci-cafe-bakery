/**
 * menuParser.ts
 * Parses Kuci Menu.md into an intermediate structure.
 * Pure parsing, no Firestore, no schema logic.
 */

export interface ParsedPriceVariant {
  name: string;
  price: number;
}

export interface ParsedItem {
  rawName: string;
  tagline?: string;
  description?: string;
  price: number | null;
  priceVariants?: ParsedPriceVariant[];
}

export interface ParsedSection {
  /** Unique key handling duplicate section numbers: "6", "6:2", "14.d:2" */
  sectionKey: string;
  sectionNumber: string;
  rawTitle: string;
  preamble?: string;
  items: ParsedItem[];
}

export interface ParsedMenu {
  sections: ParsedSection[];
  ambiguities: string[];
}

// ---------------------------------------------------------------------------
// Price parsing helpers
// ---------------------------------------------------------------------------

function parseRwfPrice(text: string): number | null {
  const cleaned = text.replace(/,/g, '').trim();
  const match = cleaned.match(/^(\d+)\s*(?:RWF)?/i);
  return match ? parseInt(match[1], 10) : null;
}

function parseSlashVariants(priceText: string): ParsedPriceVariant[] | null {
  // "15,000 / 20,000 / 25,000 RWF"
  const parts = priceText.split('/');
  if (parts.length < 2) return null;

  const sizeLabels = ['Small', 'Medium', 'Large', 'Extra Large'];
  const variants: ParsedPriceVariant[] = [];

  for (let i = 0; i < parts.length; i++) {
    const price = parseRwfPrice(parts[i] + ' RWF');
    if (price !== null) {
      variants.push({ name: sizeLabels[i] ?? `Option ${i + 1}`, price });
    }
  }

  return variants.length >= 2 ? variants : null;
}

function parseNamedVariants(text: string): ParsedPriceVariant[] | null {
  // "(Bottle) - 30,000 RWF | (Glass) - 3,000 RWF"
  const pairRegex = /\(([^)]+)\)\s*-\s*([\d,]+)\s*RWF/gi;
  const variants: ParsedPriceVariant[] = [];
  let m: RegExpExecArray | null;
  while ((m = pairRegex.exec(text)) !== null) {
    const price = parseInt(m[2].replace(/,/g, ''), 10);
    if (!isNaN(price)) variants.push({ name: m[1].trim(), price });
  }
  return variants.length >= 2 ? variants : null;
}

// ---------------------------------------------------------------------------
// Name + price extraction from a single line
// ---------------------------------------------------------------------------

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractNameAndPrice(text: string): {
  name: string;
  price: number | null;
  priceVariants?: ParsedPriceVariant[];
} {
  const cleaned = text.replace(/\*\*/g, '').trim();

  // Named variant format: "(Bottle) - 30,000 RWF | (Glass) - 3,000 RWF"
  const namedVariants = parseNamedVariants(cleaned);
  if (namedVariants) {
    const nameMatch = cleaned.match(/^([^(]+)/);
    const name = nameMatch ? nameMatch[1].trim().replace(/\([^)]*\)/g, '').trim() : '';
    return { name, price: namedVariants[0]?.price ?? null, priceVariants: namedVariants };
  }

  // Find last " - <price>" pattern
  const dashPriceRegex = / - (\d[\d,/ ]*RWF)/i;
  const dashMatch = cleaned.match(dashPriceRegex);

  if (!dashMatch || dashMatch.index === undefined) {
    return { name: cleaned.replace(/\([^)]*\)/g, '').trim(), price: null };
  }

  const namePart = cleaned.slice(0, dashMatch.index).replace(/\([^)]*\)/g, '').trim();
  const priceText = dashMatch[1];

  if (priceText.includes('/')) {
    const variants = parseSlashVariants(priceText);
    if (variants) return { name: namePart, price: variants[0].price, priceVariants: variants };
  }

  return { name: namePart, price: parseRwfPrice(priceText) };
}

// ---------------------------------------------------------------------------
// Section header detection
// ---------------------------------------------------------------------------

function parseSectionHeader(line: string): { sectionNumber: string; rawTitle: string } | null {
  const cleaned = line.replace(/^##\s*/, '').replace(/\*\*/g, '').trim();
  // Matches "1. TITLE" or "14.a. TITLE"
  const m = cleaned.match(/^(\d+(?:\.[a-zA-Z])?)\.\s+(.+)/);
  if (!m) return null;
  return { sectionNumber: m[1], rawTitle: m[2].trim() };
}

// ---------------------------------------------------------------------------
// Lines that stop description collection
// ---------------------------------------------------------------------------

const STOP_PREFIXES = [
  '## ', '### ', '---',
  '**ACCOMPANIMENTS', '**CHOOSE YOUR', '**ADD MORE',
  '*All ', '*Want ', '*Our kitchen', '\u26a0\ufe0f', '*"Our kitchen',
];

function isStop(line: string): boolean {
  const t = line.trim();
  return STOP_PREFIXES.some((p) => t.startsWith(p));
}

// ---------------------------------------------------------------------------
// Section body parser
// ---------------------------------------------------------------------------

function parseSectionBody(
  sectionLines: string[],
  label: string,
  ambiguities: string[]
): { items: ParsedItem[]; preamble: string | undefined } {
  const items: ParsedItem[] = [];
  const preambleLines: string[] = [];
  let inPreamble = true;
  let i = 0;

  while (i < sectionLines.length) {
    const line = sectionLines[i];
    const t = line.trim();

    if (t === '' || t === '---') { i++; continue; }

    // H3 item header
    if (t.startsWith('### ')) {
      inPreamble = false;
      const { name, price, priceVariants } = extractNameAndPrice(t.slice(4));

      if (!name) {
        ambiguities.push(`${label}: could not parse h3: "${t}"`);
        i++;
        continue;
      }

      i++;
      while (i < sectionLines.length && sectionLines[i].trim() === '') i++;

      // Optional italic tagline
      let tagline: string | undefined;
      if (i < sectionLines.length) {
        const next = sectionLines[i].trim();
        if (/^\*[^*].+\*$/.test(next)) {
          tagline = next.replace(/^\*/, '').replace(/\*$/, '').trim();
          i++;
          while (i < sectionLines.length && sectionLines[i].trim() === '') i++;
        }
      }

      // Description until next item or stop marker
      const descLines: string[] = [];
      while (i < sectionLines.length) {
        if (isStop(sectionLines[i])) break;
        const d = sectionLines[i].trim();
        if (d) descLines.push(d);
        i++;
      }

      items.push({
        rawName: name,
        tagline,
        description: descLines.join(' ').trim() || undefined,
        price,
        priceVariants,
      });
      continue;
    }

    // List item
    if (t.startsWith('- ')) {
      inPreamble = false;
      const content = t.slice(2).trim();

      // Strip trailing tagline: "| *...*"
      let tagline: string | undefined;
      let main = content;
      const tlMatch = content.match(/\|\s*\*([^*]+)\*\s*$/);
      if (tlMatch) {
        tagline = tlMatch[1].trim();
        main = content.slice(0, tlMatch.index!).trim();
      }

      // Named variant format (wine/spirits)
      const namedVariants = parseNamedVariants(main);
      if (namedVariants) {
        const nm = main.match(/^\*\*([^*]+)\*\*/);
        const rawName = nm ? nm[1].replace(/\([^)]*\)/g, '').trim() : '';
        if (rawName) {
          items.push({ rawName, tagline, price: namedVariants[0]?.price ?? null, priceVariants: namedVariants });
        } else {
          ambiguities.push(`${label}: could not extract name from variant line: "${t}"`);
        }
        i++;
        continue;
      }

      const { name, price, priceVariants } = extractNameAndPrice(main);
      if (!name) {
        ambiguities.push(`${label}: could not parse list item: "${t}"`);
      } else {
        items.push({ rawName: name, tagline, price, priceVariants });
      }
      i++;
      continue;
    }

    // Preamble
    if (inPreamble && !t.startsWith('#')) {
      const plain = t.replace(/^\*([^*]+)\*$/, '$1').replace(/\*\*/g, '').trim();
      if (plain) preambleLines.push(plain);
    }
    i++;
  }

  return { items, preamble: preambleLines.join(' ').trim() || undefined };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseMenuMarkdown(markdown: string): ParsedMenu {
  const lines = markdown.split('\n');
  const sections: ParsedSection[] = [];
  const ambiguities: string[] = [];
  const seenNumbers = new Map<string, number>();

  let currentSection: { sectionKey: string; sectionNumber: string; rawTitle: string } | null = null;
  let bodyLines: string[] = [];

  function flush() {
    if (!currentSection) return;
    const { items, preamble } = parseSectionBody(
      bodyLines,
      `[${currentSection.sectionKey}] ${currentSection.rawTitle}`,
      ambiguities
    );
    sections.push({ ...currentSection, preamble, items });
    currentSection = null;
    bodyLines = [];
  }

  for (const line of lines) {
    const t = line.trim();

    // Skip top-level heading
    if (t.startsWith('# ') && !t.startsWith('## ')) continue;

    if (t.startsWith('## ')) {
      const header = parseSectionHeader(t);
      if (!header) { flush(); continue; }

      flush();

      const count = (seenNumbers.get(header.sectionNumber) ?? 0) + 1;
      seenNumbers.set(header.sectionNumber, count);
      const sectionKey = count > 1 ? `${header.sectionNumber}:${count}` : header.sectionNumber;

      currentSection = { sectionKey, sectionNumber: header.sectionNumber, rawTitle: header.rawTitle };
      continue;
    }

    if (currentSection) bodyLines.push(line);
  }

  flush();

  return { sections, ambiguities };
}
