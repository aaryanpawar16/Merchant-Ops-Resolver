import type { FailureCode, KycDoc, LedgerEntry, Merchant, RiskSignals, Settlement, World } from "@/lib/engine/world";

// Turns an uploaded file (CSV, TSV or JSON) into a simulated world the agents can work in. Pure code with no
// Node dependencies, so the browser uses it for the preview and the server uses it again to run the batch.

export const MAX_BYTES = 1_000_000;
export const MAX_ROWS = 5000;
export const MAX_CASES = 50;

export class IntakeError extends Error {}

export type Rejected = { row: number; reason: string };
export type IntakeCase = {
  index: number;
  txn: string;
  merchant: string;
  amount: number;
  status: "FAILED" | "HELD";
  pattern: FailureCode;
  reason: string;
  // Optional ground truth from the file, so a labelled file can score the agents.
  expected: "resolved" | "escalated" | null;
  // Optional grouping and description from the file, used by the scorecard.
  category: string | null;
  note: string | null;
};
export type IntakeReport = {
  filename: string;
  format: "csv" | "tsv" | "json";
  rowCount: number;
  cases: IntakeCase[];
  history: number;
  rejected: Rejected[];
  columns: { source: string; field: string }[];
  ignoredColumns: string[];
  truncated: boolean;
  warnings: string[];
};
export type Intake = { report: IntakeReport; world: World };

// ---- column names ------------------------------------------------------------------------------

const FIELDS = {
  txn: ["txn", "txn_id", "txnid", "transaction", "transaction_id", "settlement_id", "id", "reference", "ref", "utr"],
  merchant: ["merchant", "merchant_name", "business", "business_name", "seller", "store"],
  amount: ["amount", "amount_inr", "amount_in_inr", "inr", "rs", "rupees", "settlement_amount", "payout", "payout_amount", "value", "amt", "total"],
  status: ["status", "settlement_status", "state"],
  reason: ["reason", "failure_reason", "failure_code", "error", "error_message", "message", "hold_reason", "remarks", "failure"],
  account: ["account", "account_number", "account_no", "acct", "beneficiary_account", "bank_account"],
  ifsc: ["ifsc", "ifsc_code", "bank_ifsc"],
  verified_ifsc: ["verified_ifsc", "correct_ifsc", "penny_drop_ifsc", "actual_ifsc"],
  email: ["email", "contact_email", "merchant_email"],
  phone: ["phone", "contact_phone", "mobile"],
  kyc_doc: ["kyc_doc", "kyc_document", "document", "kyc_type"],
  kyc_expiry: ["kyc_expiry", "kyc_expiry_date", "document_expiry", "expiry", "expires"],
  kyc_status: ["kyc_status", "kyc"],
  volume: ["volume_vs_baseline", "volume_multiple", "velocity", "volume_ratio"],
  same_week: ["same_week_last_year", "last_year_multiple", "yoy_volume"],
  repeat_share: ["repeat_customer_share", "repeat_customers", "repeat_rate"],
  ticket: ["avg_ticket_vs_baseline", "ticket_ratio"],
  chargeback: ["chargeback_rate", "chargebacks"],
  flagged_txns: ["flagged_txns", "cluster_txns", "suspicious_txns"],
  flagged_minutes: ["flagged_minutes", "cluster_minutes"],
  flagged_amount: ["flagged_amount", "cluster_amount", "suspicious_amount"],
  expected: ["expected_outcome", "expected", "ground_truth", "label"],
  category: ["category", "scenario", "tag"],
  note: ["note", "notes", "attack", "description"],
} as const;
type Field = keyof typeof FIELDS;

const normalize = (header: string) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

// ---- parsing -----------------------------------------------------------------------------------

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function detectDelimiter(firstLine: string): { delimiter: string; format: "csv" | "tsv" } {
  const counts = [",", ";", "\t", "|"].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  const best = counts.reduce((a, b) => (b.n > a.n ? b : a));
  const delimiter = best.n > 0 ? best.d : ",";
  return { delimiter, format: delimiter === "\t" ? "tsv" : "csv" };
}

function readTable(text: string, filename: string): { headers: string[]; records: Record<string, string>[]; format: IntakeReport["format"] } {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) throw new IntakeError("The file is empty.");

  if (filename.toLowerCase().endsWith(".json") || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new IntakeError("That looks like JSON but could not be read. Check for a missing comma or bracket.");
    }
    const list = Array.isArray(data) ? data : ((data as Record<string, unknown>)?.rows ?? (data as Record<string, unknown>)?.data ?? (data as Record<string, unknown>)?.settlements);
    if (!Array.isArray(list) || list.length === 0 || typeof list[0] !== "object" || list[0] === null) {
      throw new IntakeError("JSON must be a list of objects, one per settlement.");
    }
    const records = (list as Record<string, unknown>[]).map((item) =>
      Object.fromEntries(Object.entries(item).map(([key, value]) => [normalize(key), value === null || value === undefined ? "" : String(value)])),
    );
    const headers = [...new Set((list as Record<string, unknown>[]).flatMap((item) => Object.keys(item)))];
    return { headers, records, format: "json" };
  }

  const { delimiter, format } = detectDelimiter(trimmed.split("\n", 1)[0]);
  const table = parseDelimited(trimmed, delimiter);
  if (table.length < 2) throw new IntakeError("The file needs a header row and at least one data row.");
  const headers = table[0].map((h) => h.trim());
  const keys = headers.map(normalize);
  const records = table.slice(1).map((cells) => Object.fromEntries(keys.map((key, i) => [key, (cells[i] ?? "").trim()])));
  return { headers, records, format };
}

// ---- value helpers -----------------------------------------------------------------------------

function toNumber(value: string): number | null {
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// "93%" and 0.93 and 93 all mean the same share.
function toShare(value: string): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  return value.includes("%") || n > 1 ? n / 100 : n;
}

function toStatus(value: string): "FAILED" | "HELD" | "SETTLED" | null {
  const s = value.toLowerCase();
  if (/hold|held|block|review|freez|frozen/.test(s)) return "HELD";
  if (/fail|error|reject|declin|return|bounce/.test(s)) return "FAILED";
  if (/settle|success|paid|complete|credit/.test(s)) return "SETTLED";
  return null;
}

// Rule based on purpose: cheap, explainable, and wrong in a safe direction, because the agents then verify
// the claim against the data instead of trusting the label.
export function classifyFailure(reason: string): FailureCode {
  const r = reason.toLowerCase();
  if (/ifsc|beneficiary|invalid account|account (number )?(is )?(invalid|not found|does not exist|mismatch)|name mismatch|bank code/.test(r)) return "IFSC_ACCOUNT_MISMATCH";
  if (/kyc|licen[cs]e|document|compliance|gst|\bpan\b|expired/.test(r)) return "KYC_DOCUMENT_EXPIRED";
  if (/risk|velocity|fraud|suspicious|spike|chargeback|volume/.test(r)) return "RISK_VELOCITY_SPIKE";
  return "UNCLASSIFIED";
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "merchant";
const digits = (value: string) => value.replace(/[^0-9A-Za-z]/g, "");
const looksLikeIfsc = (value: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value);

// ---- the intake --------------------------------------------------------------------------------

export function buildIntake(text: string, filename: string, today: Date = new Date()): Intake {
  if (text.length > MAX_BYTES) throw new IntakeError(`The file is larger than ${Math.round(MAX_BYTES / 1000)} KB. Split it and upload the parts.`);
  const { headers, records, format } = readTable(text, filename);
  if (records.length > MAX_ROWS) throw new IntakeError(`The file has more than ${MAX_ROWS} rows. Split it and upload the parts.`);

  // Which column feeds which field.
  const present = new Set(Object.keys(records[0] ?? {}));
  const column: Partial<Record<Field, string>> = {};
  const mapping: IntakeReport["columns"] = [];
  const used = new Set<string>();
  for (const field of Object.keys(FIELDS) as Field[]) {
    const key = FIELDS[field].find((alias) => present.has(alias));
    if (key) {
      column[field] = key;
      used.add(key);
      mapping.push({ source: headers.find((h) => normalize(h) === key) ?? key, field });
    }
  }
  const ignoredColumns = headers.filter((h) => !used.has(normalize(h)));
  for (const required of ["txn", "merchant", "amount"] as const) {
    if (!column[required]) {
      throw new IntakeError(`No column for "${required}". Name a column ${FIELDS[required].slice(0, 4).join(", ")} or similar.`);
    }
  }
  if (!column.status && !column.reason) throw new IntakeError('The file needs a "status" column or a "reason" column to tell failed rows from settled ones.');

  const get = (record: Record<string, string>, field: Field) => (column[field] ? record[column[field] as string] ?? "" : "");

  const world: World = { bankLedger: {}, settlements: {}, merchants: {}, kyc: {}, risk: {}, kb: [], notifications: [], rekyc: [] };
  const rejected: Rejected[] = [];
  const warnings: string[] = [];
  const cases: IntakeCase[] = [];
  const seen = new Set<string>();
  const conflicted = new Set<string>();
  const verifiedAccounts = new Set<string>();
  let history = 0;
  const firstDataRow = format === "json" ? 1 : 2;

  records.forEach((record, i) => {
    const row = i + firstDataRow;
    const txn = get(record, "txn").trim();
    const merchantName = get(record, "merchant").trim();
    const amount = toNumber(get(record, "amount"));
    if (!txn) return void rejected.push({ row, reason: "transaction id is empty" });
    if (!merchantName) return void rejected.push({ row, reason: "merchant name is empty" });
    if (amount === null || amount <= 0) return void rejected.push({ row, reason: `amount "${get(record, "amount")}" is not a positive number` });
    if (seen.has(txn)) return void rejected.push({ row, reason: `transaction ${txn} appears more than once` });
    seen.add(txn);

    const reason = get(record, "reason").trim();
    let status = column.status ? toStatus(get(record, "status")) : null;
    if (column.status && status === null) return void rejected.push({ row, reason: `status "${get(record, "status")}" is not one of failed, held or settled` });
    if (!column.status) status = reason ? toStatus(reason) === "HELD" ? "HELD" : "FAILED" : "SETTLED";
    if (status === null) return;

    const account = digits(get(record, "account"));
    const ifsc = get(record, "ifsc").trim().toUpperCase();
    const verified = get(record, "verified_ifsc").trim().toUpperCase();
    if (ifsc && !looksLikeIfsc(ifsc)) warnings.push(`Row ${row}: "${ifsc}" does not look like an IFSC code.`);

    // The merchant record, filled in from every row that names the merchant.
    const merchantId = `m_${slug(merchantName)}`;
    const merchant: Merchant = (world.merchants[merchantId] ??= {
      id: merchantId,
      name: merchantName,
      city: "",
      segment: "",
      contactEmail: "",
      contactPhone: "",
      bank: { account: "", ifsc: "" },
    });
    merchant.contactEmail ||= get(record, "email").trim();
    merchant.contactPhone ||= get(record, "phone").trim();
    if (status !== "SETTLED") {
      merchant.bank = { account: account || merchant.bank.account, ifsc: ifsc || merchant.bank.ifsc };
    }

    // What the bank knows: an explicit verified code wins, then the code used by a payment that settled.
    if (account && looksLikeIfsc(verified)) {
      world.bankLedger[account] = { ifsc: verified, holder: merchantName.toUpperCase() } satisfies LedgerEntry;
      verifiedAccounts.add(account);
    } else if (account && status === "SETTLED" && looksLikeIfsc(ifsc)) {
      const known = world.bankLedger[account];
      // Two settled payments that disagree about where an account lives: trust neither (see below).
      if (known && known.ifsc !== ifsc) conflicted.add(account);
      else if (!known) world.bankLedger[account] = { ifsc, holder: merchantName.toUpperCase() };
    }

    // KYC and risk facts, if the file carries them.
    const doc = get(record, "kyc_doc").trim();
    const expiry = get(record, "kyc_expiry").trim();
    const kycStatus = get(record, "kyc_status").trim().toLowerCase();
    if ((doc || expiry || kycStatus) && !world.kyc[merchantId]) {
      const expiryDate = expiry ? new Date(expiry) : null;
      const expired = /expir|lapse|invalid/.test(kycStatus) || (expiryDate !== null && !Number.isNaN(expiryDate.getTime()) && expiryDate < today);
      const entry: KycDoc = { type: doc || "KYC document", id: "", status: expired ? "EXPIRED" : "VALID", expires: expiry || "unknown" };
      world.kyc[merchantId] = [entry];
    }
    const volume = toNumber(get(record, "volume"));
    if (volume !== null && !world.risk[merchantId]) {
      const txns = toNumber(get(record, "flagged_txns")) ?? 0;
      const risk: RiskSignals = {
        merchantId,
        volumeVsBaseline: volume,
        sameWeekLastYear: toNumber(get(record, "same_week")) ?? 1,
        repeatCustomerShare: toShare(get(record, "repeat_share")) ?? 0.5,
        avgTicketVsBaseline: toNumber(get(record, "ticket")) ?? 1,
        chargebackRate: toShare(get(record, "chargeback")) ?? 0.01,
        deviceCluster: {
          txns,
          minutes: toNumber(get(record, "flagged_minutes")) ?? 0,
          amount: toNumber(get(record, "flagged_amount")) ?? 0,
          sharedFingerprint: txns > 0,
        },
      };
      world.risk[merchantId] = risk;
    }

    if (status === "SETTLED") {
      history += 1;
      return;
    }

    const pattern = classifyFailure(reason);
    const settlement: Settlement = {
      txn,
      merchantId,
      amount,
      currency: "INR",
      status,
      failureCode: pattern,
      failureMessage: reason || "No reason was given",
      beneficiary: { account, ifsc, name: merchantName.toUpperCase() },
      rail: "NEFT",
      settledAmount: null,
      retained: 0,
      settleAt: null,
      idempotencyKeys: [],
      payouts: 0,
    };
    world.settlements[txn] = settlement;
    const expectedRaw = get(record, "expected").toLowerCase();
    const expected = /resolv|settle|fix/.test(expectedRaw) ? "resolved" : /escalat|human|manual/.test(expectedRaw) ? "escalated" : null;
    cases.push({
      index: cases.length,
      txn,
      merchant: merchantName,
      amount,
      status,
      pattern,
      reason: reason || "No reason was given",
      expected,
      category: get(record, "category").trim() || null,
      note: get(record, "note").trim() || null,
    });
  });

  // A planted or mistaken history row must not be able to redirect a payout. An account whose history
  // contradicts itself is left unverifiable, so any case on it escalates to a person.
  for (const account of conflicted) {
    if (verifiedAccounts.has(account)) continue;
    delete world.bankLedger[account];
    warnings.push(`History for the account ending ${account.slice(-4)} names two different IFSC codes, so it is treated as unverified.`);
  }

  if (cases.length === 0) {
    throw new IntakeError(
      history > 0
        ? "Every valid row is already settled, so there is nothing to resolve. Include rows with a failed or held status."
        : `No usable rows were found. ${rejected
            .slice(0, 3)
            .map((r) => `Row ${r.row}: ${r.reason}.`)
            .join(" ")}`.trim(),
    );
  }

  const truncated = cases.length > MAX_CASES;
  return {
    world,
    report: {
      filename,
      format,
      rowCount: records.length,
      cases: truncated ? cases.slice(0, MAX_CASES) : cases,
      history,
      rejected,
      columns: mapping,
      ignoredColumns,
      truncated,
      warnings: warnings.slice(0, 5),
    },
  };
}
