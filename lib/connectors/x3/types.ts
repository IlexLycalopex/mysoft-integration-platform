/**
 * Sage X3 connector types
 */

export interface X3Credentials {
  baseUrl:     string;   // e.g. https://x3server.example.com
  solution:    string;   // e.g. SEED
  folder:      string;   // e.g. SEED
  username:    string;
  password:    string;
  apiVersion?: string;   // default 'v1'
  useGraphQL?: boolean;  // default false
}

/** REST API URL: {baseUrl}/{solution}/api/{version}/{OBJECT} */
export function buildX3RestUrl(creds: X3Credentials, objectName: string): string {
  const version = creds.apiVersion ?? 'v1';
  const base = creds.baseUrl.replace(/\/$/, '');
  return `${base}/${creds.solution}/api/${version}/${objectName}`;
}

/** GraphQL URL: {baseUrl}/{solution}/api/graphql */
export function buildX3GraphQLUrl(creds: X3Credentials): string {
  const base = creds.baseUrl.replace(/\/$/, '');
  return `${base}/${creds.solution}/api/graphql`;
}

export function buildX3AuthHeader(creds: X3Credentials): string {
  return `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`;
}

// ── Payload shapes ────────────────────────────────────────────────────────────

export interface X3GlLine {
  ACC:     string;   // Account number
  SID:     number;   // 40 = Debit, 50 = Credit
  DESLIN?: string;   // Line description
  AMTCUR:  number;   // Amount
  FCY?:    string;   // Cost centre
  QTY?:    number;   // Quantity
}

export interface X3JournalEntry {
  JOUENTRY:  string;          // Journal code
  ACCDAT:    string;          // Accounting date YYYYMMDD
  DES?:      string;          // Description
  CUR?:      string;          // Currency
  RATMLT?:   number;          // Exchange rate
  GRPLIN:    [{ GACCLIN: X3GlLine[] }];
}

export interface X3SalesLine {
  ITMREF:       string;
  ITMDES?:      string;
  QTY:          number;
  GROPRI:       number;
  DISCRGVAL1?:  number;       // Discount %
  VACITM1?:     string;       // Tax code
}

export interface X3SalesInvoice {
  SIVTYP:   string;           // INV or CRN
  BPCINV:   string;           // Customer code
  INVDAT:   string;           // Invoice date YYYYMMDD
  ACCDAT?:  string;           // Accounting date
  NUM?:     string;           // Invoice number (omit to auto-number)
  CUR?:     string;           // Currency
  SALFCY?:  string;           // Selling site
  SDHLIN:   X3SalesLine[];
}

export interface X3PurchaseLine {
  ITMREF:   string;
  ITMDES?:  string;
  QTY:      number;
  GROPRI:   number;
  VACITM1?: string;
}

export interface X3PurchaseInvoice {
  PIVTYP:   string;           // INV or CRN
  BPSINV:   string;           // Supplier code
  INVDAT:   string;           // Invoice date YYYYMMDD
  ACCDAT?:  string;
  CUR?:     string;
  PRHFCY?:  string;           // Purchasing site
  PDHLIN:   X3PurchaseLine[];
}

export interface X3Customer {
  BPCNUM:   string;           // Customer code
  BPCNAM:   string;           // Customer name
  STCNUM?:  string;           // Tax number
  CUR?:     string;           // Currency
  PTE?:     string;           // Payment terms
  BPCGRU?:  string;           // Customer group
  BPCADD?:  { ADD1?: string; ADD2?: string; CTY?: string; POSCOD?: string; CRY?: string };
  TEL?:     string;
  WEB?:     string;
}

export interface X3Supplier {
  BPSNUM:   string;
  BPSNAM:   string;
  STCNUM?:  string;
  CUR?:     string;
  PTE?:     string;
  BPSGRU?:  string;
  BPSADD?:  { ADD1?: string; CTY?: string; POSCOD?: string; CRY?: string };
  TEL?:     string;
  WEB?:     string;
}

export interface X3Item {
  ITMREF:   string;
  ITMDES1:  string;
  ITMDES2?: string;
  ITMTYP?:  string;           // STO, SVC, MISC
  TCLCOD?:  string;           // Product line
  STU?:     string;           // Stock unit
  VACITM?:  string;           // Tax code
  ITMSTA?:  string;           // A or I
}

export interface X3Payment {
  PAYTYP:   string;
  BPR:      string;           // Business partner code
  BPRTYP?:  string;           // C or S
  PAYDAT:   string;           // Payment date YYYYMMDD
  AMTCUR:   number;
  CURPAY?:  string;
  BANNUM?:  string;           // Bank account
  BPRVCR?:  string;           // Invoice reference
  DES?:     string;
}

export type X3Payload =
  | { type: 'x3_gaccentry';   objectName: 'GACCENTRY';   data: X3JournalEntry }
  | { type: 'x3_sinvoice';    objectName: 'SINVOICE';    data: X3SalesInvoice }
  | { type: 'x3_pinvoice';    objectName: 'PINVOICE';    data: X3PurchaseInvoice }
  | { type: 'x3_bpcustomer';  objectName: 'BPCUSTOMER';  data: X3Customer }
  | { type: 'x3_bpsupplier';  objectName: 'BPSUPPLIER';  data: X3Supplier }
  | { type: 'x3_itmmaster';   objectName: 'ITMMASTER';   data: X3Item }
  | { type: 'x3_payment';     objectName: 'PAYMENT';     data: X3Payment };
