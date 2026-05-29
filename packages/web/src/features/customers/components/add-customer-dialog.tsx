import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  type CustomerFormData,
  type UserFormData,
  INITIAL_CUSTOMER,
  INITIAL_USER,
  STATUS_OPTIONS,
  INPUT_CLASS,
  Field,
} from "./form-fields";

export type { CustomerFormData, UserFormData };

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { customer: CustomerFormData; user: UserFormData }) => void;
}

const SHARED_FIELDS = ["name", "location", "phone", "email"] as const;

export function AddCustomerDialog({ open, onOpenChange, onSubmit }: AddCustomerDialogProps) {
  const { t } = useTranslation("customers");
  const [customer, setCustomer] = useState<CustomerFormData>(INITIAL_CUSTOMER);
  const [user, setUser] = useState<UserFormData>(INITIAL_USER);
  const [useSameInfo, setUseSameInfo] = useState(true);

  const isPrivate = customer.customerType === "private";

  function handleCustomerChange(field: keyof CustomerFormData, value: string) {
    setCustomer((prev) => ({ ...prev, [field]: value }));
    if (useSameInfo && SHARED_FIELDS.includes(field as typeof SHARED_FIELDS[number])) {
      setUser((prev) => ({ ...prev, [field]: value }));
    }
  }

  function handleUseSameInfo(checked: boolean) {
    setUseSameInfo(checked);
    if (checked) {
      setUser({ name: customer.name, location: customer.location, phone: customer.phone, email: customer.email });
    }
  }

  function handleTypeChange(type: "business" | "private") {
    setCustomer({ ...INITIAL_CUSTOMER, customerType: type });
    setUser(INITIAL_USER);
    setUseSameInfo(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const finalCustomer: CustomerFormData = isPrivate
      ? {
          ...customer,
          name: `${customer.firstName} ${customer.lastName}`.trim(),
          categoryOfWork: "Private",
        }
      : customer;

    const finalUser: UserFormData = isPrivate
      ? { name: finalCustomer.name, location: customer.location, phone: customer.phone, email: customer.email }
      : user;

    onSubmit({ customer: finalCustomer, user: finalUser });
    setCustomer(INITIAL_CUSTOMER);
    setUser(INITIAL_USER);
    setUseSameInfo(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("add.title")}</DialogTitle>
          <DialogDescription>{t("add.description")}</DialogDescription>
        </DialogHeader>

        {/* Type toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleTypeChange("business")}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              !isPrivate
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            {t("type.business")}
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange("private")}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              isPrivate
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            {t("type.private")}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {isPrivate ? (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("sections.personalDetails")}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t("fields.firstName")} required>
                  <input
                    type="text"
                    value={customer.firstName}
                    onChange={(e) => handleCustomerChange("firstName", e.target.value)}
                    className={INPUT_CLASS}
                    required
                    placeholder={t("placeholders.firstName")}
                  />
                </Field>
                <Field label={t("fields.lastName")} required>
                  <input
                    type="text"
                    value={customer.lastName}
                    onChange={(e) => handleCustomerChange("lastName", e.target.value)}
                    className={INPUT_CLASS}
                    required
                    placeholder={t("placeholders.lastName")}
                  />
                </Field>
                <Field label={t("fields.email")} required>
                  <input
                    type="email"
                    value={customer.email}
                    onChange={(e) => handleCustomerChange("email", e.target.value)}
                    className={INPUT_CLASS}
                    required
                    placeholder={t("placeholders.personEmail")}
                  />
                </Field>
                <Field label={t("fields.phone")} required>
                  <input
                    type="tel"
                    value={customer.phone}
                    onChange={(e) => handleCustomerChange("phone", e.target.value)}
                    className={INPUT_CLASS}
                    required
                    placeholder={t("placeholders.phone")}
                  />
                </Field>
                <Field label={t("fields.location")} required>
                  <input
                    type="text"
                    value={customer.location}
                    onChange={(e) => handleCustomerChange("location", e.target.value)}
                    className={INPUT_CLASS}
                    required
                    placeholder={t("placeholders.stockholm")}
                  />
                </Field>
                <Field label={t("fields.personalNumber")}>
                  <input
                    type="text"
                    value={customer.personalNumber}
                    onChange={(e) => handleCustomerChange("personalNumber", e.target.value)}
                    className={INPUT_CLASS}
                    placeholder={t("placeholders.personalNumber")}
                  />
                </Field>
                <Field label={t("fields.status")} required>
                  <select
                    value={customer.status}
                    onChange={(e) => handleCustomerChange("status", e.target.value)}
                    className={INPUT_CLASS}
                    required
                  >
                    {STATUS_OPTIONS.map((value) => (
                      <option key={value} value={value}>{t(`status.${value}`)}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          ) : (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("sections.companyInformation")}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t("fields.name")} required>
                  <input type="text" value={customer.name} onChange={(e) => handleCustomerChange("name", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.companyName")} />
                </Field>
                <Field label={t("fields.location")} required>
                  <input type="text" value={customer.location} onChange={(e) => handleCustomerChange("location", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.cityCountry")} />
                </Field>
                <Field label={t("fields.phone")} required>
                  <input type="tel" value={customer.phone} onChange={(e) => handleCustomerChange("phone", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.phone")} />
                </Field>
                <Field label={t("fields.email")} required>
                  <input type="email" value={customer.email} onChange={(e) => handleCustomerChange("email", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.companyEmail")} />
                </Field>
                <Field label={t("fields.status")} required>
                  <select value={customer.status} onChange={(e) => handleCustomerChange("status", e.target.value)} className={INPUT_CLASS} required>
                    {STATUS_OPTIONS.map((value) => (
                      <option key={value} value={value}>{t(`status.${value}`)}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t("fields.categoryOfWork")} required>
                  <input type="text" value={customer.categoryOfWork} onChange={(e) => handleCustomerChange("categoryOfWork", e.target.value)} className={INPUT_CLASS} required placeholder={t("placeholders.categoryOfWork")} />
                </Field>
                <Field label={t("fields.description")} className="sm:col-span-2">
                  <textarea value={customer.description} onChange={(e) => handleCustomerChange("description", e.target.value)} className={cn(INPUT_CLASS, "min-h-[60px] resize-y")} placeholder={t("placeholders.description")} rows={2} />
                </Field>
                <Field label={t("fields.website")}>
                  <input type="url" value={customer.website} onChange={(e) => handleCustomerChange("website", e.target.value)} className={INPUT_CLASS} placeholder={t("placeholders.website")} />
                </Field>
                <Field label={t("fields.orgNumber")}>
                  <input type="text" value={customer.orgNumber} onChange={(e) => handleCustomerChange("orgNumber", e.target.value)} className={INPUT_CLASS} placeholder={t("placeholders.orgNumber")} />
                </Field>
                <Field label={t("fields.legalName")}>
                  <input type="text" value={customer.legalName} onChange={(e) => handleCustomerChange("legalName", e.target.value)} className={INPUT_CLASS} placeholder={t("placeholders.legalName")} />
                </Field>
              </div>
            </div>
          )}

          {!isPrivate && (
            <>
              <div className="border-t border-border" />

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("sections.contactPerson")}
                  </h3>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <Checkbox checked={useSameInfo} onCheckedChange={(checked) => handleUseSameInfo(checked === true)} />
                    {t("add.useSameInfo")}
                  </label>
                </div>

                {useSameInfo ? (
                  <p className="text-sm text-muted-foreground">
                    {t("add.sameInfoNote")}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label={t("fields.name")} required>
                      <input type="text" value={user.name} onChange={(e) => setUser((p) => ({ ...p, name: e.target.value }))} className={INPUT_CLASS} required placeholder={t("placeholders.contactName")} />
                    </Field>
                    <Field label={t("fields.location")} required>
                      <input type="text" value={user.location} onChange={(e) => setUser((p) => ({ ...p, location: e.target.value }))} className={INPUT_CLASS} required placeholder={t("placeholders.cityCountry")} />
                    </Field>
                    <Field label={t("fields.phone")} required>
                      <input type="tel" value={user.phone} onChange={(e) => setUser((p) => ({ ...p, phone: e.target.value }))} className={INPUT_CLASS} required placeholder={t("placeholders.phone")} />
                    </Field>
                    <Field label={t("fields.email")} required>
                      <input type="email" value={user.email} onChange={(e) => setUser((p) => ({ ...p, email: e.target.value }))} className={INPUT_CLASS} required placeholder={t("placeholders.contactEmail")} />
                    </Field>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
              {t("actions.cancel")}
            </button>
            <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              {t("add.submit")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
