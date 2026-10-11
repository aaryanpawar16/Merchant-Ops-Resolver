// A simulated merchant-ops world: merchants, settlements, bank directory, KYC and risk data.
// The tools below are the only way agents read or change it. Every run gets a fresh copy.

// UNCLASSIFIED is a failure the rules do not recognise. The agents never guess at those: they escalate.
export type FailureCode = "IFSC_ACCOUNT_MISMATCH" | "KYC_DOCUMENT_EXPIRED" | "RISK_VELOCITY_SPIKE" | "UNCLASSIFIED";

export type Settlement = {
  txn: string;
  merchantId: string;
  amount: number;
  currency: "INR";
  status: "FAILED" | "HELD" | "PROCESSING" | "SETTLED";
  failureCode: FailureCode;
  failureMessage: string;
  beneficiary: { account: string; ifsc: string; name: string };
  rail: "NEFT" | "IMPS";
  settledAmount: number | null;
  retained: number;
  settleAt: number | null; // epoch ms when a PROCESSING settlement completes
  idempotencyKeys: string[];
  // How many times money actually moved for this settlement. More than one means it was paid twice.
  payouts: number;
};

// What an agent can see of a settlement through the bank API. The bank's own payout counter and idempotency-key store
// are not part of it, so an agent cannot tell from the API alone that a payout happened twice.
export type SettlementView = Omit<Settlement, "payouts" | "idempotencyKeys">;

export type Merchant = {
  id: string;
  name: string;
  city: string;
  segment: string;
  contactEmail: string;
  contactPhone: string;
  bank: { account: string; ifsc: string };
};

export type KycDoc = { type: string; id: string; status: "VALID" | "EXPIRED"; expires: string };

export type RiskSignals = {
  merchantId: string;
  volumeVsBaseline: number;
  sameWeekLastYear: number;
  repeatCustomerShare: number;
  avgTicketVsBaseline: number;
  chargebackRate: number;
  deviceCluster: { txns: number; minutes: number; amount: number; sharedFingerprint: boolean };
};

// What the bank has on record for an account: the IFSC it really sits at and the holder name. In an uploaded
// file this comes from the merchant's earlier settled payments, or from a verified_ifsc column.
export type LedgerEntry = { ifsc: string; holder: string };

export type World = {
  bankLedger: Record<string, LedgerEntry>;
  settlements: Record<string, Settlement>;
  merchants: Record<string, Merchant>;
  kyc: Record<string, KycDoc[]>;
  risk: Record<string, RiskSignals>;
  kb: { txn: string; entry: string }[];
  notifications: { merchantId: string; channel: string; body: string }[];
  rekyc: { merchantId: string; channel: string }[];
};

// IFSC directory. The first four letters identify the bank.
export const IFSC_DIRECTORY: Record<string, { bank: string; branch: string }> = {
  HDFC0001234: { bank: "HDFC Bank", branch: "Lajpat Nagar, New Delhi" },
  SBIN0000456: { bank: "State Bank of India", branch: "Karol Bagh, New Delhi" },
  ICIC0002211: { bank: "ICICI Bank", branch: "Koramangala, Bengaluru" },
  UTIB0000789: { bank: "Axis Bank", branch: "T Nagar, Chennai" },
};

// Bank names by the first four letters of an IFSC code.
const BANK_BY_PREFIX: Record<string, string> = {
  HDFC: "HDFC Bank",
  SBIN: "State Bank of India",
  ICIC: "ICICI Bank",
  UTIB: "Axis Bank",
  PUNB: "Punjab National Bank",
  KKBK: "Kotak Mahindra Bank",
  YESB: "Yes Bank",
  BARB: "Bank of Baroda",
  CNRB: "Canara Bank",
  IDIB: "Indian Bank",
  UBIN: "Union Bank of India",
  IDFB: "IDFC First Bank",
  INDB: "IndusInd Bank",
  FDRL: "Federal Bank",
};

export function bankFromIfsc(ifsc: string): string {
  return IFSC_DIRECTORY[ifsc]?.bank ?? BANK_BY_PREFIX[ifsc.slice(0, 4).toUpperCase()] ?? "an unknown bank";
}

export function seedWorld(): World {
  return {
    bankLedger: {
      "50100234567890": { ifsc: "SBIN0000456", holder: "SHARMA KIRANA STORE" },
      "917020034411882": { ifsc: "UTIB0000789", holder: "RAO PHARMACY" },
      "003401556677889": { ifsc: "ICIC0002211", holder: "IYER SWEETS AND SNACKS" },
    },
    settlements: {
      "48213": {
        txn: "48213",
        merchantId: "m_1001",
        amount: 84250,
        currency: "INR",
        status: "FAILED",
        failureCode: "IFSC_ACCOUNT_MISMATCH",
        failureMessage: "Beneficiary validation failed: account does not exist at branch for IFSC HDFC0001234",
        beneficiary: { account: "50100234567890", ifsc: "HDFC0001234", name: "SHARMA KIRANA STORE" },
        rail: "NEFT",
        settledAmount: null,
        retained: 0,
        settleAt: null,
        idempotencyKeys: [],
        payouts: 0,
      },
      "48220": {
        txn: "48220",
        merchantId: "m_1002",
        amount: 156900,
        currency: "INR",
        status: "HELD",
        failureCode: "KYC_DOCUMENT_EXPIRED",
        failureMessage: "Settlement held by compliance: merchant KYC document expired",
        beneficiary: { account: "917020034411882", ifsc: "UTIB0000789", name: "RAO PHARMACY" },
        rail: "NEFT",
        settledAmount: null,
        retained: 0,
        settleAt: null,
        idempotencyKeys: [],
        payouts: 0,
      },
      "48231": {
        txn: "48231",
        merchantId: "m_1003",
        amount: 212400,
        currency: "INR",
        status: "HELD",
        failureCode: "RISK_VELOCITY_SPIKE",
        failureMessage: "Settlement held by risk engine: transaction velocity 4.1x above merchant baseline",
        beneficiary: { account: "003401556677889", ifsc: "ICIC0002211", name: "IYER SWEETS AND SNACKS" },
        rail: "NEFT",
        settledAmount: null,
        retained: 0,
        settleAt: null,
        idempotencyKeys: [],
        payouts: 0,
      },
    },
    merchants: {
      m_1001: {
        id: "m_1001",
        name: "Sharma Kirana",
        city: "New Delhi",
        segment: "Grocery",
        contactEmail: "owner@sharmakirana.example",
        contactPhone: "+91-98100-00001",
        bank: { account: "50100234567890", ifsc: "HDFC0001234" },
      },
      m_1002: {
        id: "m_1002",
        name: "Rao Pharmacy",
        city: "Chennai",
        segment: "Pharmacy",
        contactEmail: "accounts@raopharmacy.example",
        contactPhone: "+91-98400-00002",
        bank: { account: "917020034411882", ifsc: "UTIB0000789" },
      },
      m_1003: {
        id: "m_1003",
        name: "Iyer Sweets",
        city: "Bengaluru",
        segment: "Food and beverage",
        contactEmail: "hello@iyersweets.example",
        contactPhone: "+91-98450-00003",
        bank: { account: "003401556677889", ifsc: "ICIC0002211" },
      },
    },
    kyc: {
      m_1001: [
        { type: "PAN", id: "ABCPS1234K", status: "VALID", expires: "2031-03-31" },
        { type: "GST certificate", id: "07ABCPS1234K1Z5", status: "VALID", expires: "2027-06-30" },
      ],
      m_1002: [
        { type: "PAN", id: "BCDPR5678L", status: "VALID", expires: "2031-03-31" },
        { type: "Drug licence", id: "TN/20B/2021/4471", status: "EXPIRED", expires: "2026-09-30" },
      ],
      m_1003: [
        { type: "PAN", id: "CDEPI9012M", status: "VALID", expires: "2031-03-31" },
        { type: "FSSAI licence", id: "11220004005678", status: "VALID", expires: "2028-01-15" },
      ],
    },
    risk: {
      m_1001: {
        merchantId: "m_1001",
        volumeVsBaseline: 1.1,
        sameWeekLastYear: 1.0,
        repeatCustomerShare: 0.88,
        avgTicketVsBaseline: 1.0,
        chargebackRate: 0.001,
        deviceCluster: { txns: 0, minutes: 0, amount: 0, sharedFingerprint: false },
      },
      m_1002: {
        merchantId: "m_1002",
        volumeVsBaseline: 1.0,
        sameWeekLastYear: 1.0,
        repeatCustomerShare: 0.74,
        avgTicketVsBaseline: 1.0,
        chargebackRate: 0.002,
        deviceCluster: { txns: 0, minutes: 0, amount: 0, sharedFingerprint: false },
      },
      m_1003: {
        merchantId: "m_1003",
        volumeVsBaseline: 4.1,
        sameWeekLastYear: 3.8,
        repeatCustomerShare: 0.93,
        avgTicketVsBaseline: 1.05,
        chargebackRate: 0.001,
        deviceCluster: { txns: 14, minutes: 6, amount: 8300, sharedFingerprint: true },
      },
    },
    kb: [],
    notifications: [],
    rekyc: [],
  };
}

export const KNOWN_TXNS = ["48213", "48220", "48231"];

export const PRESETS = [
  {
    id: "ifsc",
    label: "Failed settlement",
    detail: "Bank IFSC mismatch",
    instruction: "Sharma Kirana's settlement for txn #48213 failed. Investigate and resolve.",
  },
  {
    id: "kyc",
    label: "Compliance hold",
    detail: "Expired KYC, needs a human",
    instruction: "Rao Pharmacy's settlement for txn #48220 is on hold. Find out why and sort it out.",
  },
  {
    id: "risk",
    label: "Risk hold",
    detail: "Agents disagree, coordinator decides",
    instruction: "Iyer Sweets' settlement for txn #48231 was held by risk. Investigate and release it if it is safe.",
  },
] as const;
