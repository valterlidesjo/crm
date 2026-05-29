import { useState, useEffect, useRef } from "react";
import { onSnapshot, query, orderBy } from "firebase/firestore";
import { partnerCol } from "@/lib/firebase-partner";
import { usePartner } from "@/lib/partner";
import type { ShopifyOrder, ShopifyOrderStatus } from "@crm/shared";

export function useOrders(statusFilter?: ShopifyOrderStatus) {
  const { partnerId } = usePartner();
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    const q = query(partnerCol(partnerId, "orders"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ShopifyOrder[];
      setOrders(data);
      setLoading(false);
    });

    return () => {
      unsubscribe();
      isSubscribedRef.current = false;
    };
  }, [partnerId]);

  const filtered = statusFilter ? orders.filter((o) => o.status === statusFilter) : orders;

  return { orders: filtered, loading };
}
