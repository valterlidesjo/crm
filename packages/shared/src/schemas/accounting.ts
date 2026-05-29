import { Schema } from "effect";
import { VatRate } from "../enums/vat-rate";
import { TransactionType } from "../enums/transaction-type";

export const BASAccount = Schema.Struct({
  number: Schema.String,
  name: Schema.String,
  accountClass: Schema.Number,
});

export type BASAccount = typeof BASAccount.Type;

export const AccountCategory = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  transactionType: TransactionType,
  defaultAccountNumber: Schema.String,
  defaultAccountName: Schema.String,
  vatAccountNumber: Schema.String,
  paymentAccountNumber: Schema.String,
  defaultVatRate: VatRate,
});

export type AccountCategory = typeof AccountCategory.Type;

export const JournalEntryLine = Schema.Struct({
  accountNumber: Schema.String,
  accountName: Schema.String,
  debit: Schema.Number,
  credit: Schema.Number,
});

export type JournalEntryLine = typeof JournalEntryLine.Type;

export const JournalEntry = Schema.Struct({
  id: Schema.String,
  date: Schema.String,
  description: Schema.String,
  transactionType: TransactionType,
  category: Schema.String,
  totalAmount: Schema.Number,
  vatRate: VatRate,
  vatAmount: Schema.Number,
  lines: Schema.Array(JournalEntryLine),
  /** Origin of this entry. Undefined = legacy/manually created. */
  source: Schema.optional(
    Schema.Union(
      Schema.Literal("manual"),
      Schema.Literal("import"),
      Schema.Literal("invoice"),
      Schema.Literal("purchase-order"),
      Schema.Literal("shopify")
    )
  ),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export type JournalEntry = typeof JournalEntry.Type;

/** Origin of a journal entry. `undefined` on legacy entries is treated as "manual". */
export type JournalEntrySource = NonNullable<JournalEntry["source"]>;
