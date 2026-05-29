import { useState, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/page-container";
import {
  useCompanyProfile,
  type CompanyProfileFormData,
} from "@/features/profile/hooks/use-profile";
import type { CompanyProfile } from "@crm/shared";
import { useIsAdmin, signOut } from "@/lib/auth";
import { currentLocale } from "@/i18n";

export const Route = createFileRoute("/profile/")({
  component: ProfilePage,
});

// ─── Display formatters ───────────────────────────────────────────────────────

const fmtNumber = (v: number | "") =>
  v === "" ? "" : new Intl.NumberFormat(currentLocale()).format(v) + " kr";

const fmtDate = (v: string) => {
  if (!v) return "";
  try {
    return new Intl.DateTimeFormat(currentLocale(), { dateStyle: "long" }).format(
      new Date(v)
    );
  } catch {
    return v;
  }
};

// ─── Active input styles ──────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";

// ─── InlineField ─────────────────────────────────────────────────────────────

type FieldType = "text" | "number" | "email" | "tel" | "url" | "date" | "textarea";

interface InlineFieldProps {
  label: string;
  value: string | number | "";
  type?: FieldType;
  placeholder?: string;
  editable: boolean;
  onSave: (value: string | number | "") => void;
  format?: (v: string | number) => string;
}

function InlineField({
  label,
  value,
  type = "text",
  placeholder,
  editable,
  onSave,
  format,
}: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState<string | number | "">(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Sync external changes (e.g. real-time Firestore updates) into local state
  // while not editing. Intentional external→local sync.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editing) setLocalValue(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function handleBlur() {
    setEditing(false);
    if (localValue !== value) {
      const parsed =
        type === "number" && localValue !== ""
          ? Number(localValue)
          : localValue;
      onSave(parsed);
    }
  }

  const displayValue = value !== "" && value !== null && value !== undefined
    ? (format ? format(value as string | number) : String(value))
    : null;

  const isEmpty = displayValue === null;

  // Non-admin: read-only text
  if (!editable) {
    return (
      <div className="py-3 border-b border-border/50 last:border-0">
        <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
        <p className="text-sm text-foreground">{displayValue ?? "—"}</p>
      </div>
    );
  }

  // Admin + editing
  if (editing) {
    const sharedProps = {
      ref: inputRef as React.RefObject<HTMLInputElement>,
      className: INPUT_CLASS,
      value: String(localValue),
      placeholder,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setLocalValue(e.target.value),
      onBlur: handleBlur,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          setLocalValue(value);
          setEditing(false);
        }
        if (e.key === "Enter" && type !== "textarea") {
          (e.target as HTMLElement).blur();
        }
      },
    };

    return (
      <div className="py-3 border-b border-border/50 last:border-0">
        <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
        {type === "textarea" ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            className={INPUT_CLASS + " min-h-[80px] resize-y"}
            value={String(localValue)}
            placeholder={placeholder}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setLocalValue(value);
                setEditing(false);
              }
            }}
            autoFocus
          />
        ) : (
          <input {...sharedProps} type={type} autoFocus />
        )}
      </div>
    );
  }

  // Admin + has value: text with hover pencil
  if (!isEmpty) {
    return (
      <div
        className="py-3 border-b border-border/50 last:border-0 cursor-pointer group"
        onClick={() => setEditing(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
      >
        <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-sm text-foreground">{displayValue}</p>
          <svg
            className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z"
            />
          </svg>
        </div>
      </div>
    );
  }

  // Admin + empty: subtle placeholder input
  return (
    <div className="py-3 border-b border-border/50 last:border-0">
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <input
        className="w-full border-0 bg-transparent p-0 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-0"
        type={type === "textarea" ? "text" : type}
        value={String(localValue)}
        placeholder={placeholder ?? "—"}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={() => setEditing(true)}
      />
    </div>
  );
}

// ─── LogoUpload ───────────────────────────────────────────────────────────────

function LogoUpload({
  currentUrl,
  editable,
  onUpload,
}: {
  currentUrl?: string;
  editable: boolean;
  onUpload: (file: File) => Promise<void>;
}) {
  const { t } = useTranslation("profile");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | undefined>(currentUrl);

  useEffect(() => {
    setPreview(currentUrl);
  }, [currentUrl]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setError(null);
    setUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("logo.uploadFailed"));
      setPreview(currentUrl); // revert preview on failure
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected after an error
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="py-3 border-b border-border/50 last:border-0">
      <p className="text-xs font-medium text-muted-foreground mb-2">{t("logo.label")}</p>
      <div className="flex items-center gap-4">
        {preview ? (
          <img
            src={preview}
            alt={t("logo.alt")}
            className="h-12 max-w-[140px] object-contain rounded border border-border bg-muted/20 p-1"
          />
        ) : (
          <div className="h-12 w-24 rounded border border-dashed border-border bg-muted/20 flex items-center justify-center">
            <span className="text-xs text-muted-foreground">{t("logo.none")}</span>
          </div>
        )}
        {editable && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              {uploading ? t("logo.uploading") : preview ? t("logo.replace") : t("logo.upload")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={handleFile}
            />
          </>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

// ─── FSkattRow ────────────────────────────────────────────────────────────────

function FSkattRow({
  value,
  editable,
  onSave,
}: {
  value: boolean;
  editable: boolean;
  onSave: (v: boolean) => void;
}) {
  const { t } = useTranslation("profile");
  const statusLabel = value ? t("fSkatt.registered") : t("fSkatt.notRegistered");
  return (
    <div className="py-3 border-b border-border/50 last:border-0">
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{t("fSkatt.label")}</p>
      {editable ? (
        <label className="flex items-center gap-2 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => onSave(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm text-foreground">{statusLabel}</span>
        </label>
      ) : (
        <p className="text-sm text-foreground">{statusLabel}</p>
      )}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
        {title}
      </h3>
      <div className="rounded-lg border border-border bg-card px-4 divide-y-0">
        {children}
      </div>
    </div>
  );
}

// ─── Form data helpers ────────────────────────────────────────────────────────

const INITIAL_FORM: CompanyProfileFormData = {
  orgNumber: "",
  legalName: "",
  bank: "",
  bankgiro: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  incomeGoal: "",
  mrrGoal: "",
  goalDeadline: "",
  goalDescription: "",
  fSkatt: false,
};

function profileToForm(profile: CompanyProfile | null): CompanyProfileFormData {
  if (!profile) return INITIAL_FORM;
  return {
    orgNumber: profile.orgNumber,
    legalName: profile.legalName,
    bank: profile.bank,
    bankgiro: profile.bankgiro,
    address: profile.address ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    website: profile.website ?? "",
    incomeGoal: profile.incomeGoal ?? "",
    mrrGoal: profile.mrrGoal ?? "",
    goalDeadline: profile.goalDeadline ?? "",
    goalDescription: profile.goalDescription ?? "",
    fSkatt: profile.fSkatt,
  };
}

// ─── ProfilePage ──────────────────────────────────────────────────────────────

function ProfilePage() {
  const { t } = useTranslation("profile");
  const { profile, loading, saveProfile, uploadLogo } = useCompanyProfile();
  const isAdmin = useIsAdmin();
  const [form, setForm] = useState<CompanyProfileFormData>(INITIAL_FORM);

  // Populate the form once the profile loads from Firestore. Intentional
  // external→local sync.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (profile) setForm(profileToForm(profile));
  }, [profile]);

  function handleFieldSave(
    field: keyof CompanyProfileFormData,
    value: string | number | boolean | ""
  ) {
    const newForm = { ...form, [field]: value };
    setForm(newForm);
    saveProfile(newForm).catch(console.error);
  }

  if (loading) {
    return (
      <PageContainer title={t("page.title")}>
        <p className="text-sm text-muted-foreground">{t("states.loading")}</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={t("page.title")}
      description={t("page.description")}
    >
      <div className="max-w-xl">
        <Section title={t("sections.companyInfo")}>
          <LogoUpload
            currentUrl={profile?.logoUrl}
            editable={isAdmin}
            onUpload={(file) => uploadLogo(file).then(() => {})}
          />
          <InlineField
            label={t("fields.legalName.label")}
            value={form.legalName}
            editable={isAdmin}
            onSave={(v) => handleFieldSave("legalName", v)}
            placeholder={t("fields.legalName.placeholder")}
          />
          <InlineField
            label={t("fields.orgNumber.label")}
            value={form.orgNumber}
            editable={isAdmin}
            onSave={(v) => handleFieldSave("orgNumber", v)}
            placeholder={t("fields.orgNumber.placeholder")}
          />
          <InlineField
            label={t("fields.bank.label")}
            value={form.bank}
            editable={isAdmin}
            onSave={(v) => handleFieldSave("bank", v)}
            placeholder={t("fields.bank.placeholder")}
          />
          <InlineField
            label={t("fields.bankgiro.label")}
            value={form.bankgiro}
            editable={isAdmin}
            onSave={(v) => handleFieldSave("bankgiro", v)}
            placeholder={t("fields.bankgiro.placeholder")}
          />
          <InlineField
            label={t("fields.address.label")}
            value={form.address}
            editable={isAdmin}
            onSave={(v) => handleFieldSave("address", v)}
            placeholder={t("fields.address.placeholder")}
          />
          <InlineField
            label={t("fields.phone.label")}
            value={form.phone}
            type="tel"
            editable={isAdmin}
            onSave={(v) => handleFieldSave("phone", v)}
            placeholder={t("fields.phone.placeholder")}
          />
          <InlineField
            label={t("fields.email.label")}
            value={form.email}
            type="email"
            editable={isAdmin}
            onSave={(v) => handleFieldSave("email", v)}
            placeholder={t("fields.email.placeholder")}
          />
          <InlineField
            label={t("fields.website.label")}
            value={form.website}
            type="url"
            editable={isAdmin}
            onSave={(v) => handleFieldSave("website", v)}
            placeholder={t("fields.website.placeholder")}
          />
          <FSkattRow
            value={form.fSkatt}
            editable={isAdmin}
            onSave={(v) => handleFieldSave("fSkatt", v)}
          />
        </Section>

        <Section title={t("sections.goals")}>
          <InlineField
            label={t("fields.incomeGoal.label")}
            value={form.incomeGoal}
            type="number"
            editable={isAdmin}
            onSave={(v) => handleFieldSave("incomeGoal", v)}
            placeholder={t("fields.incomeGoal.placeholder")}
            format={(v) => fmtNumber(v as number)}
          />
          <InlineField
            label={t("fields.mrrGoal.label")}
            value={form.mrrGoal}
            type="number"
            editable={isAdmin}
            onSave={(v) => handleFieldSave("mrrGoal", v)}
            placeholder={t("fields.mrrGoal.placeholder")}
            format={(v) => fmtNumber(v as number)}
          />
          <InlineField
            label={t("fields.goalDeadline.label")}
            value={form.goalDeadline}
            type="date"
            editable={isAdmin}
            onSave={(v) => handleFieldSave("goalDeadline", v)}
            format={(v) => fmtDate(String(v))}
          />
          <InlineField
            label={t("fields.goalDescription.label")}
            value={form.goalDescription}
            type="textarea"
            editable={isAdmin}
            onSave={(v) => handleFieldSave("goalDescription", v)}
            placeholder={t("fields.goalDescription.placeholder")}
          />
        </Section>

        <button
          type="button"
          onClick={() => signOut()}
          className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
        >
          {t("logout")}
        </button>
      </div>
    </PageContainer>
  );
}
