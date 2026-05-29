import { currentLocale } from "@/i18n";

export function formatCurrency(amount: number, currency = "SEK"): string {
  return new Intl.NumberFormat(currentLocale(), {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(currentLocale(), {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function getDaysRemaining(deadline: string): number {
  const now = new Date();
  const end = new Date(deadline);
  const diffTime = end.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
