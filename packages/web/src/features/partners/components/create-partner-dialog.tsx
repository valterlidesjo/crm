import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, ChevronLeft, Search } from "lucide-react";
import { getDocs, query, where, limit } from "firebase/firestore";
import { partnerCol } from "@/lib/firebase-partner";
import type { Customer, ContactUser, PartnerRole } from "@crm/shared";
import { PARTNER_ROLE_LABELS } from "@crm/shared";

interface ContactMember {
  email: string;
  name: string;
  role: PartnerRole;
  include: boolean;
}

interface Props {
  partnerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, member?: { email: string; role: PartnerRole }) => Promise<void>;
}

function slugPreview(name: string): string {
  return name
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CreatePartnerDialog({ partnerId, open, onOpenChange, onCreate }: Props) {
  const { t } = useTranslation(["partners", "common"]);
  const [step, setStep] = useState<1 | 2>(1);
  const [source, setSource] = useState<"scratch" | "customer">("scratch");
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [contactMember, setContactMember] = useState<ContactMember | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch customers when dialog opens
  useEffect(() => {
    if (!open || !partnerId) return;
    setLoadingCustomers(true);
    getDocs(query(partnerCol(partnerId, "customers"))).then((snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Customer[];
      setCustomers(data.sort((a, b) => a.name.localeCompare(b.name)));
      setLoadingCustomers(false);
    });
  }, [open, partnerId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSource("scratch");
      setSearch("");
      setSelectedCustomer(null);
      setContactMember(null);
      setName("");
    }
  }, [open]);

  const handleSelectCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setName(customer.name);

    // Fetch contact user for this customer
    const snap = await getDocs(
      query(partnerCol(partnerId, "contactUsers"), where("customerId", "==", customer.id), limit(1))
    );
    if (!snap.empty) {
      const cu = { id: snap.docs[0].id, ...snap.docs[0].data() } as ContactUser;
      if (cu.email) {
        setContactMember({ email: cu.email, name: cu.name, role: "user", include: true });
      }
    }
  };

  const handleNext = () => {
    if (source === "scratch") {
      setStep(2);
    } else if (selectedCustomer) {
      setStep(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const member =
        contactMember?.include && contactMember.email
          ? { email: contactMember.email, role: contactMember.role }
          : undefined;
      await onCreate(name.trim(), member);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-background shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-base font-semibold">
              {step === 1 ? t("create.titleStep1") : t("create.titleStep2")}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("create.stepIndicator", { step })}</span>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="p-5 space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setSource("scratch"); setSelectedCustomer(null); setName(""); }}
                className={[
                  "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  source === "scratch"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input text-muted-foreground hover:bg-muted",
                ].join(" ")}
              >
                {t("create.fromScratch")}
              </button>
              <button
                type="button"
                onClick={() => setSource("customer")}
                className={[
                  "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  source === "customer"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input text-muted-foreground hover:bg-muted",
                ].join(" ")}
              >
                {t("create.fromCustomer")}
              </button>
            </div>

            {source === "customer" && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder={t("create.searchCustomers")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto rounded-md border border-input">
                  {loadingCustomers ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">{t("create.loadingCustomers")}</p>
                  ) : filteredCustomers.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">{t("create.noCustomers")}</p>
                  ) : (
                    filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCustomer(c)}
                        className={[
                          "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                          selectedCustomer?.id === c.id ? "bg-primary/5 text-primary font-medium" : "",
                        ].join(" ")}
                      >
                        <span>{c.name}</span>
                        {selectedCustomer?.id === c.id && (
                          <span className="text-xs">{t("create.selected")}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleNext}
                disabled={source === "customer" && !selectedCustomer}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {t("create.next")}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("create.partnerName")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("create.partnerNamePlaceholder")}
                required
                autoFocus
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {name.trim() && (
                <p className="text-xs text-muted-foreground">
                  {t("create.partnerIdPreview")} <span className="font-mono">{slugPreview(name)}</span>
                </p>
              )}
            </div>

            {contactMember && (
              <div className="rounded-md border border-border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("create.contactPerson")}</p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={contactMember.include}
                    onChange={(e) =>
                      setContactMember({ ...contactMember, include: e.target.checked })
                    }
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{contactMember.name}</p>
                    <p className="text-xs text-muted-foreground">{contactMember.email}</p>
                  </div>
                  {contactMember.include && (
                    <select
                      value={contactMember.role}
                      onChange={(e) =>
                        setContactMember({ ...contactMember, role: e.target.value as PartnerRole })
                      }
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      {(Object.keys(PARTNER_ROLE_LABELS) as PartnerRole[]).map((r) => (
                        <option key={r} value={r}>{t(`role.${r}`)}</option>
                      ))}
                    </select>
                  )}
                </label>
                {contactMember.include && (
                  <p className="text-xs text-muted-foreground">
                    {t("create.willBeAddedPrefix")} <span className="font-mono">allowedEmails</span> {t("create.willBeAddedSuffix")}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted"
              >
                {t("common:actions.cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? t("create.creating") : t("create.createPartner")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
