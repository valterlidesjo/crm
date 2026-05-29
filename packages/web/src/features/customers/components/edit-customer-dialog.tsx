import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Customer } from "@crm/shared";
import type { ContactUser } from "@crm/shared";
import {
  type CustomerFormData,
  type UserFormData,
  STATUS_OPTIONS,
  INPUT_CLASS,
  Field,
} from "./form-fields";

interface EditCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  contactUser: ContactUser | null;
  onSaveCustomer: (id: string, data: CustomerFormData) => void;
  onSaveUser: (id: string, data: UserFormData) => void;
}

export function EditCustomerDialog({ open, onOpenChange, customer, contactUser, onSaveCustomer, onSaveUser }: EditCustomerDialogProps) {
  const { t } = useTranslation("customers");
  const [editingUser, setEditingUser] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerFormData>(toCustomerForm(customer));
  const [userForm, setUserForm] = useState<UserFormData>(toUserForm(contactUser));

  useEffect(() => {
    setCustomerForm(toCustomerForm(customer));
    setEditingUser(false);
  }, [customer]);

  useEffect(() => {
    setUserForm(toUserForm(contactUser));
  }, [contactUser]);

  const isPrivate = customerForm.customerType === "private";

  function handleCustomerChange(field: keyof CustomerFormData, value: string | number | "") {
    setCustomerForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleUserChange(field: keyof UserFormData, value: string) {
    setUserForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;

    if (editingUser && contactUser) {
      onSaveUser(contactUser.id, userForm);
    } else {
      const finalForm: CustomerFormData = isPrivate
        ? {
            ...customerForm,
            name: `${customerForm.firstName} ${customerForm.lastName}`.trim(),
            categoryOfWork: "Private",
          }
        : customerForm;
      onSaveCustomer(customer.id, finalForm);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingUser ? t("edit.titleContactPerson") : t("edit.titleCustomer")}</DialogTitle>
          <DialogDescription>
            {editingUser
              ? t("edit.descriptionContactPerson")
              : t("edit.descriptionCustomer")}
          </DialogDescription>
        </DialogHeader>

        {!isPrivate && (
          <div className="mb-4 flex items-center gap-3">
            <span className={cn("text-sm font-medium", !editingUser && "text-foreground", editingUser && "text-muted-foreground")}>{t("edit.toggleCustomer")}</span>
            <Switch checked={editingUser} onCheckedChange={setEditingUser} />
            <span className={cn("text-sm font-medium", editingUser && "text-foreground", !editingUser && "text-muted-foreground")}>{t("edit.toggleContactPerson")}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {editingUser && !isPrivate ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("fields.name")} required>
                <input type="text" value={userForm.name} onChange={(e) => handleUserChange("name", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.contactName")} />
              </Field>
              <Field label={t("fields.location")} required>
                <input type="text" value={userForm.location} onChange={(e) => handleUserChange("location", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.cityCountry")} />
              </Field>
              <Field label={t("fields.phone")} required>
                <input type="tel" value={userForm.phone} onChange={(e) => handleUserChange("phone", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.phone")} />
              </Field>
              <Field label={t("fields.email")} required>
                <input type="email" value={userForm.email} onChange={(e) => handleUserChange("email", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.contactEmail")} />
              </Field>
            </div>
          ) : isPrivate ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("fields.firstName")} required>
                <input type="text" value={customerForm.firstName} onChange={(e) => handleCustomerChange("firstName", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.firstName")} />
              </Field>
              <Field label={t("fields.lastName")} required>
                <input type="text" value={customerForm.lastName} onChange={(e) => handleCustomerChange("lastName", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.lastName")} />
              </Field>
              <Field label={t("fields.email")} required>
                <input type="email" value={customerForm.email} onChange={(e) => handleCustomerChange("email", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.personEmail")} />
              </Field>
              <Field label={t("fields.phone")} required>
                <input type="tel" value={customerForm.phone} onChange={(e) => handleCustomerChange("phone", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.phone")} />
              </Field>
              <Field label={t("fields.location")} required>
                <input type="text" value={customerForm.location} onChange={(e) => handleCustomerChange("location", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.stockholm")} />
              </Field>
              <Field label={t("fields.personalNumber")}>
                <input type="text" value={customerForm.personalNumber} onChange={(e) => handleCustomerChange("personalNumber", e.target.value)} className={INPUT_CLASS} placeholder={t("placeholders.personalNumber")} />
              </Field>
              <Field label={t("fields.status")} required>
                <select value={customerForm.status} onChange={(e) => handleCustomerChange("status", e.target.value)} className={INPUT_CLASS} required>
                  {STATUS_OPTIONS.map((value) => (
                    <option key={value} value={value}>{t(`status.${value}`)}</option>
                  ))}
                </select>
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("fields.name")} required>
                <input type="text" value={customerForm.name} onChange={(e) => handleCustomerChange("name", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.companyName")} />
              </Field>
              <Field label={t("fields.location")} required>
                <input type="text" value={customerForm.location} onChange={(e) => handleCustomerChange("location", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.cityCountry")} />
              </Field>
              <Field label={t("fields.phone")} required>
                <input type="tel" value={customerForm.phone} onChange={(e) => handleCustomerChange("phone", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.phone")} />
              </Field>
              <Field label={t("fields.email")} required>
                <input type="email" value={customerForm.email} onChange={(e) => handleCustomerChange("email", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.companyEmail")} />
              </Field>
              <Field label={t("fields.status")} required>
                <select value={customerForm.status} onChange={(e) => handleCustomerChange("status", e.target.value)} className={INPUT_CLASS} required>
                  {STATUS_OPTIONS.map((value) => (
                    <option key={value} value={value}>{t(`status.${value}`)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("fields.categoryOfWork")} required>
                <input type="text" value={customerForm.categoryOfWork} onChange={(e) => handleCustomerChange("categoryOfWork", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.categoryOfWork")} />
              </Field>
              <Field label={t("fields.description")} className="sm:col-span-2">
                <textarea value={customerForm.description} onChange={(e) => handleCustomerChange("description", e.target.value)} className={cn(INPUT_CLASS, "min-h-[60px] resize-y")} placeholder={t("placeholders.descriptionShort")} rows={2} />
              </Field>
              <Field label={t("fields.website")}>
                <input type="url" value={customerForm.website} onChange={(e) => handleCustomerChange("website", e.target.value)} className={INPUT_CLASS} placeholder={t("placeholders.website")} />
              </Field>
              <Field label={t("fields.orgNumber")}>
                <input type="text" value={customerForm.orgNumber} onChange={(e) => handleCustomerChange("orgNumber", e.target.value)} className={INPUT_CLASS} placeholder={t("placeholders.orgNumber")} />
              </Field>
              <Field label={t("fields.legalName")}>
                <input type="text" value={customerForm.legalName} onChange={(e) => handleCustomerChange("legalName", e.target.value)} className={INPUT_CLASS} placeholder={t("placeholders.legalName")} />
              </Field>
              {customerForm.status === "mrr" && (
                <Field label={t("fields.mrr")}>
                  <input
                    type="number"
                    value={customerForm.mrr}
                    onChange={(e) => handleCustomerChange("mrr", e.target.value ? Number(e.target.value) : "")}
                    className={INPUT_CLASS}
                    placeholder={t("placeholders.mrr")}
                  />
                </Field>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
              {t("actions.cancel")}
            </button>
            <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              {t("edit.save")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toCustomerForm(c: Customer | null): CustomerFormData {
  if (!c) return {
    customerType: "business",
    name: "", location: "", phone: "", email: "",
    status: "not_contacted", categoryOfWork: "",
    description: "", website: "", orgNumber: "", legalName: "", mrr: "",
    firstName: "", lastName: "", personalNumber: "",
  };
  return {
    customerType: c.customerType ?? "business",
    name: c.name,
    location: c.location,
    phone: c.phone,
    email: c.email,
    status: c.status,
    categoryOfWork: c.categoryOfWork,
    description: c.description ?? "",
    website: c.website ?? "",
    orgNumber: c.orgNumber ?? "",
    legalName: c.legalName ?? "",
    mrr: c.mrr ?? "",
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    personalNumber: c.personalNumber ?? "",
  };
}

function toUserForm(u: ContactUser | null): UserFormData {
  if (!u) return { name: "", location: "", phone: "", email: "" };
  return { name: u.name, location: u.location, phone: u.phone, email: u.email };
}
