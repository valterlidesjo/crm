import { useState, useEffect, useCallback, useRef } from "react";
import {
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
} from "firebase/firestore";
import { partnerCol, partnerDocRef } from "@/lib/firebase-partner";
import { usePartner } from "@/lib/partner";
import type { JournalEntry } from "@crm/shared";
import type { DateRange } from "@/features/accounting/utils/period-range";

/**
 * Max entries fetched per query. Exposed so the page can tell whether the
 * result was capped (and therefore whether summed totals are complete).
 */
export const JOURNAL_ENTRY_QUERY_LIMIT = 2000;

export function useJournalEntries(dateRange?: DateRange) {
  const { partnerId } = usePartner();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    // Prevent double-subscription in StrictMode
    if (isSubscribedRef.current) {
      return;
    }

    isSubscribedRef.current = true;

    // With a date range: scope the query to the period. Without: load the most
    // recent entries (dashboard/summary use). Both share a single safety cap so
    // the page can detect truncation consistently.
    const q = dateRange
      ? query(
          partnerCol(partnerId, "journalEntries"),
          where("date", ">=", dateRange.start),
          where("date", "<", dateRange.afterEnd),
          orderBy("date", "desc"),
          limit(JOURNAL_ENTRY_QUERY_LIMIT)
        )
      : query(
          partnerCol(partnerId, "journalEntries"),
          orderBy("date", "desc"),
          limit(JOURNAL_ENTRY_QUERY_LIMIT)
        );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id,
        })) as JournalEntry[];
        setEntries(data);
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
    // Depend on the primitive range bounds, not the dateRange object, so a new
    // object identity each render doesn't re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, dateRange?.start, dateRange?.afterEnd]);

  const addEntry = useCallback(
    async (
      entry: Omit<JournalEntry, "id" | "createdAt" | "updatedAt" | "source"> & {
        source?: JournalEntry["source"];
      }
    ) => {
      const now = new Date().toISOString();
      await addDoc(partnerCol(partnerId, "journalEntries"), {
        source: "manual",
        ...entry,
        createdAt: now,
        updatedAt: now,
      });
    },
    [partnerId]
  );

  const updateEntry = useCallback(
    async (
      id: string,
      entry: Omit<JournalEntry, "id" | "createdAt" | "updatedAt">
    ) => {
      const now = new Date().toISOString();
      await updateDoc(partnerDocRef(partnerId, "journalEntries", id), {
        ...entry,
        updatedAt: now,
      });
    },
    [partnerId]
  );

  const deleteEntry = useCallback(async (id: string) => {
    await deleteDoc(partnerDocRef(partnerId, "journalEntries", id));
  }, [partnerId]);

  return { entries, loading, error, addEntry, updateEntry, deleteEntry };
}
