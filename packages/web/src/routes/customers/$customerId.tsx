import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { onSnapshot } from "firebase/firestore";
import { PageContainer } from "@/components/layout/page-container";
import { useCustomers } from "@/features/customers/hooks/use-customers";
import { partnerDocRef } from "@/lib/firebase-partner";
import { usePartner } from "@/lib/partner";
import { EditCustomerDialog } from "@/features/customers/components/edit-customer-dialog";
import type { Customer, ContactUser } from "@crm/shared";
import type { CustomerFormData, UserFormData } from "@/features/customers/components/form-fields";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Pencil,
  MapPin,
  Phone,
  Mail,
  Globe,
  Building2,
  FileText,
  Briefcase,
  User,
} from "lucide-react";

export const Route = createFileRoute("/customers/$customerId")({
  component: CustomerDetailPage,
});

const STATUS_COLORS: Record<string, string> = {
  not_contacted: "bg-gray-100 text-gray-700",
  contacted: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  warm: "bg-orange-100 text-orange-700",
  mrr: "bg-green-100 text-green-700",
  completed: "bg-emerald-100 text-emerald-700",
  lost: "bg-red-100 text-red-700",
};

function CustomerDetailPage() {
  const { t } = useTranslation("customers");
  const { customerId } = Route.useParams();
  const navigate = useNavigate();
  const { partnerId } = usePartner();
  const { updateCustomer, updateUser, fetchContactUser } = useCustomers();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contactUser, setContactUser] = useState<ContactUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const isSubscribedRef = useRef(false);

  useEffect(() => {
    // Prevent double-subscription in StrictMode
    if (isSubscribedRef.current) {
      return;
    }

    isSubscribedRef.current = true;

    const unsubscribe = onSnapshot(partnerDocRef(partnerId, "customers", customerId), (snap) => {
      if (snap.exists()) {
        setCustomer({ id: snap.id, ...snap.data() } as Customer);
      } else {
        setCustomer(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      isSubscribedRef.current = false;
    };
  }, [customerId, partnerId]);

  useEffect(() => {
    fetchContactUser(customerId).then(setContactUser);
  }, [customerId, fetchContactUser]);

  function handleSaveCustomer(id: string, data: CustomerFormData) {
    updateCustomer(id, data);
    setEditOpen(false);
  }

  function handleSaveUser(id: string, data: UserFormData) {
    updateUser(id, data);
    setEditOpen(false);
  }

  if (loading) {
    return (
      <PageContainer title={t("detail.detailTitle")}>
        <p className="text-sm text-muted-foreground">{t("detail.loading")}</p>
      </PageContainer>
    );
  }

  if (!customer) {
    return (
      <PageContainer title={t("detail.notFoundTitle")}>
        <p className="text-sm text-muted-foreground">
          {t("detail.notFoundBody")}
        </p>
        <button
          onClick={() => navigate({ to: "/pipeline" })}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {t("detail.backToPipeline")}
        </button>
      </PageContainer>
    );
  }

  return (
    <PageContainer title={customer.name}>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <button
          onClick={() => navigate({ to: "/pipeline" })}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> {t("detail.back")}
        </button>
        <button
          onClick={() => setEditOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" /> {t("detail.edit")}
        </button>
      </div>

      {/* Status + category header */}
      <div className="flex items-center gap-3 mb-6">
        <span
          className={cn(
            "inline-block rounded-full px-3 py-1 text-xs font-medium",
            STATUS_COLORS[customer.status]
          )}
        >
          {t(`status.${customer.status}`)}
        </span>
        <span className="text-sm text-muted-foreground">
          {customer.categoryOfWork}
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Customer info */}
        <div className="rounded-lg border border-border p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4" /> {t("detail.companyInformation")}
          </h3>
          <div className="space-y-3">
            <InfoRow icon={<MapPin className="h-4 w-4" />} label={t("detail.info.location")} value={customer.location} />
            <InfoRow icon={<Phone className="h-4 w-4" />} label={t("detail.info.phone")} value={customer.phone} />
            <InfoRow icon={<Mail className="h-4 w-4" />} label={t("detail.info.email")} value={customer.email} />
            {customer.website && (
              <InfoRow icon={<Globe className="h-4 w-4" />} label={t("detail.info.website")} value={customer.website} isLink />
            )}
            {customer.orgNumber && (
              <InfoRow icon={<FileText className="h-4 w-4" />} label={t("detail.info.orgNumber")} value={customer.orgNumber} />
            )}
            {customer.legalName && (
              <InfoRow icon={<Building2 className="h-4 w-4" />} label={t("detail.info.legalName")} value={customer.legalName} />
            )}
            {customer.description && (
              <InfoRow icon={<Briefcase className="h-4 w-4" />} label={t("detail.info.description")} value={customer.description} />
            )}
          </div>
        </div>

        {/* Contact person */}
        <div className="rounded-lg border border-border p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <User className="h-4 w-4" /> {t("detail.contactPerson")}
          </h3>
          {contactUser ? (
            <div className="space-y-3">
              <InfoRow icon={<User className="h-4 w-4" />} label={t("detail.info.name")} value={contactUser.name} />
              <InfoRow icon={<MapPin className="h-4 w-4" />} label={t("detail.info.location")} value={contactUser.location} />
              <InfoRow icon={<Phone className="h-4 w-4" />} label={t("detail.info.phone")} value={contactUser.phone} />
              <InfoRow icon={<Mail className="h-4 w-4" />} label={t("detail.info.email")} value={contactUser.email} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("detail.noContactPerson")}
            </p>
          )}
        </div>
      </div>

      {/* Timestamps */}
      <div className="mt-6 flex gap-4 text-xs text-muted-foreground">
        <span>{t("detail.created", { date: new Date(customer.createdAt).toLocaleDateString() })}</span>
        <span>{t("detail.updated", { date: new Date(customer.updatedAt).toLocaleDateString() })}</span>
      </div>

      <EditCustomerDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        customer={customer}
        contactUser={contactUser}
        onSaveCustomer={handleSaveCustomer}
        onSaveUser={handleSaveUser}
      />
    </PageContainer>
  );
}

function InfoRow({
  icon,
  label,
  value,
  isLink,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isLink?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        {isLink ? (
          <a
            href={value.startsWith("http") ? value : `https://${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            {value}
          </a>
        ) : (
          <p className="text-sm text-foreground">{value}</p>
        )}
      </div>
    </div>
  );
}
