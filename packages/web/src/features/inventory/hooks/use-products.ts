import { useState, useEffect, useCallback, useRef } from "react";
import {
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { partnerCol, partnerDocRef } from "@/lib/firebase-partner";
import { usePartner } from "@/lib/partner";
import { removeUndefined } from "@/lib/firestore";
import type { Product } from "@crm/shared";

export interface ProductFormData {
  title: string;
  description?: string;
  imageUrl?: string;
  vendor?: string;
  status: "active" | "archived";
  sku?: string;
  price?: number;
  costPrice?: number;
  stock: number;
  groupTitle?: string;
}

export function useProducts() {
  const { partnerId } = usePartner();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    const q = query(
      partnerCol(partnerId, "products"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Product[];
      setProducts(data);
      setLoading(false);
    });

    return () => {
      unsubscribe();
      isSubscribedRef.current = false;
    };
  }, [partnerId]);

  const addProduct = useCallback(
    async (data: ProductFormData) => {
      const now = new Date().toISOString();
      const ref = await addDoc(
        partnerCol(partnerId, "products"),
        removeUndefined({
          title: data.title,
          status: data.status,
          stock: data.stock,
          sku: data.sku,
          price: data.price,
          costPrice: data.costPrice,
          groupTitle: data.groupTitle,
          description: data.description,
          imageUrl: data.imageUrl,
          vendor: data.vendor,
          createdAt: now,
          updatedAt: now,
        })
      );
      return ref.id;
    },
    [partnerId]
  );

  const updateProduct = useCallback(
    async (id: string, data: Partial<ProductFormData>) => {
      const now = new Date().toISOString();
      await updateDoc(partnerDocRef(partnerId, "products", id), {
        ...removeUndefined(data),
        updatedAt: now,
      });
    },
    [partnerId]
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      await deleteDoc(partnerDocRef(partnerId, "products", id));
    },
    [partnerId]
  );

  // Set stock for an article (source of truth update)
  const updateStock = useCallback(
    async (productId: string, newStock: number) => {
      const now = new Date().toISOString();
      await updateDoc(partnerDocRef(partnerId, "products", productId), {
        stock: newStock,
        updatedAt: now,
      });
    },
    [partnerId]
  );

  // Decrement stock for an article (used when recording a private sale / invoice)
  const decrementStock = useCallback(
    async (productId: string, quantity: number) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return;
      const newStock = Math.max(0, product.stock - quantity);
      await updateStock(productId, newStock);
      return newStock;
    },
    [products, updateStock]
  );

  return {
    products,
    loading,
    addProduct,
    updateProduct,
    deleteProduct,
    updateStock,
    decrementStock,
  };
}
