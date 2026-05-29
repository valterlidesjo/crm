import { useState, useEffect, useCallback, useRef } from "react";
import {
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  doc,
  runTransaction,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { partnerCol, partnerDocRef } from "@/lib/firebase-partner";
import { usePartner } from "@/lib/partner";
import { buildInvoiceJournalEntry } from "../utils/build-invoice-journal-entry";
import type { Invoice, InvoiceStatusType } from "@crm/shared";

export interface InvoiceFormData {
  customerId: string;
  invoiceNumber: string;
  invoiceRef: string;
  invoiceDate: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: string;
  }[];
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  currency: string;
  dueDate: string;
  overdueInterestRate: number;
  status: InvoiceStatusType;
  paidDate?: string;
  isRecurring: boolean;
  isInternational: boolean;
  notes?: string;
  language: "sv" | "en";
}

export async function generateInvoiceNumber(partnerId: string): Promise<string> {
  const now = new Date();
  const dateStr =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0");
  const prefix = `F-${dateStr}`;

  const counterRef = doc(db, "partners", partnerId, "meta", "invoiceCounter");

  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? ((snap.data()[dateStr] as number) ?? 0) : 0;
    const next = current + 1;
    if (snap.exists()) {
      tx.update(counterRef, { [dateStr]: next });
    } else {
      tx.set(counterRef, { [dateStr]: next });
    }
    return next;
  });

  return `${prefix}-${seq.toString().padStart(3, "0")}`;
}

export function generateInvoiceRef(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let ref = "";
  for (let i = 0; i < 4; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ref;
}

export function useInvoices() {
  const { partnerId } = usePartner();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    // Prevent double-subscription in StrictMode
    if (isSubscribedRef.current) {
      return;
    }

    isSubscribedRef.current = true;

    const q = query(
      partnerCol(partnerId, "invoices"),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Invoice[];
        setInvoices(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
      isSubscribedRef.current = false;
    };
  }, [partnerId]);

  const addInvoice = useCallback(async (data: InvoiceFormData) => {
    const now = new Date().toISOString();
    const invoiceNumber =
      data.invoiceNumber || (await generateInvoiceNumber(partnerId));

    const payload = {
      customerId: data.customerId,
      invoiceNumber,
      invoiceRef: data.invoiceRef,
      invoiceDate: data.invoiceDate,
      items: data.items,
      subtotal: data.subtotal,
      vatAmount: data.vatAmount,
      totalAmount: data.totalAmount,
      currency: data.currency,
      dueDate: data.dueDate,
      overdueInterestRate: data.overdueInterestRate,
      status: data.status,
      isRecurring: data.isRecurring,
      isInternational: data.isInternational,
      language: data.language,
      ...(data.notes && { notes: data.notes }),
      createdAt: now,
      updatedAt: now,
    };

    const ref = await addDoc(partnerCol(partnerId, "invoices"), payload);
    return { id: ref.id, invoiceNumber };
  }, [partnerId]);

  const updateInvoice = useCallback(
    async (id: string, data: Partial<InvoiceFormData>) => {
      const now = new Date().toISOString();
      await updateDoc(partnerDocRef(partnerId, "invoices", id), {
        ...data,
        updatedAt: now,
      });
    },
    [partnerId]
  );

  const deleteInvoice = useCallback(async (id: string) => {
    await deleteDoc(partnerDocRef(partnerId, "invoices", id));
  }, [partnerId]);

  const cancelInvoice = useCallback(async (id: string, reason: string) => {
    const now = new Date().toISOString();
    await updateDoc(partnerDocRef(partnerId, "invoices", id), {
      status: "cancelled",
      cancellationReason: reason,
      updatedAt: now,
    });
  }, [partnerId]);

  const markAsPaid = useCallback(async (id: string, invoice: Invoice) => {
    const now = new Date().toISOString();
    const paidDate = now.slice(0, 10);

    const batch = writeBatch(db);

    batch.update(partnerDocRef(partnerId, "invoices", id), {
      status: "paid",
      paidDate,
      updatedAt: now,
    });

    const entryData = buildInvoiceJournalEntry(invoice, paidDate);
    const entryRef = doc(partnerCol(partnerId, "journalEntries"));
    batch.set(entryRef, {
      ...entryData,
      source: "invoice",
      createdAt: now,
      updatedAt: now,
    });

    await batch.commit();
  }, [partnerId]);

  return {
    invoices,
    loading,
    error,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    cancelInvoice,
    markAsPaid,
    generateInvoiceNumber: (pid?: string) => generateInvoiceNumber(pid ?? partnerId),
    generateInvoiceRef,
  };
}
