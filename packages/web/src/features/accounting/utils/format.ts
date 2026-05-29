import { currentLocale } from "@/i18n";

export function formatAmount(amount: number): string {
  return amount.toLocaleString(currentLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
