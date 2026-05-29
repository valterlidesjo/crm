import { CustomerStatus } from "@crm/shared";
import type { CustomerStatusType } from "@crm/shared";

export interface CustomerFormData {
  customerType: "business" | "private";
  name: string;
  location: string;
  phone: string;
  email: string;
  status: CustomerStatusType;
  // business fields
  categoryOfWork: string;
  description: string;
  website: string;
  orgNumber: string;
  legalName: string;
  mrr: number | "";
  // private fields
  firstName: string;
  lastName: string;
  personalNumber: string;
}

export interface UserFormData {
  name: string;
  location: string;
  phone: string;
  email: string;
}

export const INITIAL_CUSTOMER: CustomerFormData = {
  customerType: "business",
  name: "",
  location: "",
  phone: "",
  email: "",
  status: "not_contacted",
  categoryOfWork: "",
  description: "",
  website: "",
  orgNumber: "",
  legalName: "",
  mrr: "",
  firstName: "",
  lastName: "",
  personalNumber: "",
};

export const INITIAL_USER: UserFormData = {
  name: "",
  location: "",
  phone: "",
  email: "",
};

export const STATUS_OPTIONS = CustomerStatus.literals as readonly CustomerStatusType[];

export const INPUT_CLASS = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";

export function Field({ label, required, children, className }: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-foreground">
        {label}{required && " *"}
      </label>
      {children}
    </div>
  );
}
