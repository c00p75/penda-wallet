import { toMinorUnits } from '@/src/lib/money';

export type MoMoProvider = 'airtel' | 'mtn' | 'zamtel' | 'bank' | 'unknown';

export interface ParsedMoMo {
  provider: MoMoProvider;
  type: 'expense' | 'income';
  amountMinor: number;
  currencyHint: 'ZMW' | 'USD' | null;
  merchant: string | null;
  reference: string | null;
  balanceMinor: number | null;
  transactionDate: string;
}

const AMOUNT_RE = /(?<![A-Za-z])(K|ZMW|USD|\$)\s?([\d,]+(?:\.\d{1,2})?)/gi;
const EXPENSE_RE = /\b(sent|paid|payment|debited|purchase|withdraw|withdrawn|bought|deducted)\b/i;
const INCOME_RE = /\b(received|credited|deposit|deposited|refund|cash\s?in)\b/i;
const DATE_RE = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/;

interface ParseOptions {
  now?: Date;
}

function amountToMinor(raw: string): number {
  return toMinorUnits(parseFloat(raw.replace(/,/g, '')));
}

function symbolToCurrency(symbol: string): 'ZMW' | 'USD' | null {
  const s = symbol.toUpperCase();
  if (s === 'K' || s === 'ZMW') return 'ZMW';
  if (s === '$' || s === 'USD') return 'USD';
  return null;
}

function detectProvider(text: string): MoMoProvider {
  if (/\bmtn\b|\bmomo\b|financial transaction id/i.test(text)) return 'mtn';
  if (/airtel|(?<![A-Za-z])PP\d/i.test(text)) return 'airtel';
  if (/\bzamtel\b|kwacha\s?link/i.test(text)) return 'zamtel';
  if (/\baccount\b|zanaco|stanbic|\bfnb\b|absa|standard chartered|indo[- ]?zambia|zambia national/i.test(text)) {
    return 'bank';
  }
  return 'unknown';
}

function extractMerchant(text: string): string | null {
  const m = text.match(
    /\b(?:to|from|at)\b\s+(.+?)(?=\s*(?:\(|\.|,|$|\bsuccessful\b|\bfor\b|\byour\b|\bnew\b|\bavailable\b|\bfee\b|\bref\b|\bbalance\b|\bbal\b))/i,
  );
  if (!m) return null;
  const name = m[1].trim().replace(/\s+/g, ' ');
  return name || null;
}

function extractReference(text: string): string | null {
  const m = text.match(
    /(?:reference|ref|txn\s*id|financial transaction id)\b[:.]?\s*([A-Za-z0-9.\-]+)/i,
  );
  if (!m) return null;
  return m[1].replace(/[.\-]+$/, '') || null;
}

function extractDate(text: string, now: Date): string {
  const m = text.match(DATE_RE);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return now.toISOString().slice(0, 10);
}

export function parseMoMoText(text: string, opts: ParseOptions = {}): ParsedMoMo | null {
  const now = opts.now ?? new Date();

  const isExpense = EXPENSE_RE.test(text);
  const isIncome = INCOME_RE.test(text);
  if (isExpense === isIncome) {
    if (!isExpense) return null;
  }

  let principal: { minor: number; symbol: string } | null = null;
  let balanceMinor: number | null = null;

  for (const match of text.matchAll(AMOUNT_RE)) {
    const [, symbol, num] = match;
    const context = text.slice(Math.max(0, match.index! - 20), match.index).toLowerCase();
    if (/fee/.test(context)) continue;
    if (/bal/.test(context)) {
      balanceMinor = amountToMinor(num);
      continue;
    }
    if (!principal) principal = { minor: amountToMinor(num), symbol };
  }

  if (!principal) return null;

  return {
    provider: detectProvider(text),
    type: isIncome && !isExpense ? 'income' : 'expense',
    amountMinor: principal.minor,
    currencyHint: symbolToCurrency(principal.symbol),
    merchant: extractMerchant(text),
    reference: extractReference(text),
    balanceMinor,
    transactionDate: extractDate(text, now),
  };
}
