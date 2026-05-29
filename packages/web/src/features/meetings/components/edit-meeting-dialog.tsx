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
import { Field, AttendeeInput, INPUT_CLASS } from "./meeting-form-fields";
import { useCustomers } from "@/features/customers/hooks/use-customers";
import type { MeetingFormData } from "../hooks/use-meetings";
import type { Meeting } from "@crm/shared";
import { CalendarCheck, Trash2, ExternalLink } from "lucide-react";

interface EditMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: Meeting;
  onSubmit: (data: Partial<MeetingFormData>) => Promise<void>;
  onDelete: () => Promise<void>;
  isCalendarConnected: boolean;
}

function meetingToFormData(meeting: Meeting): MeetingFormData {
  return {
    title: meeting.title,
    description: meeting.description || "",
    location: meeting.location || "",
    startTime: meeting.startTime.slice(0, 16), // datetime-local format
    endTime: meeting.endTime.slice(0, 16),
    allDay: meeting.allDay || false,
    attendees: (meeting.attendees || []).map((a) => ({
      email: a.email,
      name: a.name,
    })),
    customerId: meeting.customerId || "",
    dealId: meeting.dealId || "",
    contactId: meeting.contactId || "",
    notes: meeting.notes || "",
    sendNotifications: meeting.sendNotifications ?? true,
  };
}

export function EditMeetingDialog({
  open,
  onOpenChange,
  meeting,
  onSubmit,
  onDelete,
  isCalendarConnected,
}: EditMeetingDialogProps) {
  const { t } = useTranslation("meetings");
  const { t: tCommon } = useTranslation("common");
  const [form, setForm] = useState<MeetingFormData>(meetingToFormData(meeting));
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { customers } = useCustomers();

  function handleChange<K extends keyof MeetingFormData>(
    field: K,
    value: MeetingFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete();
      onOpenChange(false);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  const isSyncedWithGoogle = !!meeting.googleCalendarEventId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("edit.title")}
            {isSyncedWithGoogle && (
              <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-normal text-green-700">
                <CalendarCheck className="h-3 w-3" />
                {t("edit.syncedBadge")}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {isSyncedWithGoogle
              ? t("edit.descriptionWithCalendar")
              : `${t("edit.descriptionBase")}.`}
          </DialogDescription>
        </DialogHeader>

        {/* Google Calendar Link */}
        {meeting.googleCalendarLink && (
          <a
            href={meeting.googleCalendarLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            {t("edit.viewInGoogle")}
          </a>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Meeting Details */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("sections.details")}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("fields.title")} required className="sm:col-span-2">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  className={INPUT_CLASS}
                  required
                  placeholder={t("placeholders.title")}
                />
              </Field>

              <Field label={t("fields.startTime")} required>
                <input
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(e) => handleChange("startTime", e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
              </Field>

              <Field label={t("fields.endTime")} required>
                <input
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(e) => handleChange("endTime", e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
              </Field>

              <Field label={t("fields.location")}>
                <input
                  type="text"
                  value={form.location || ""}
                  onChange={(e) => handleChange("location", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder={t("placeholders.location")}
                />
              </Field>

              <div className="flex items-center gap-2 self-end pb-2">
                <Checkbox
                  id="allDay-edit"
                  checked={form.allDay}
                  onCheckedChange={(checked) =>
                    handleChange("allDay", checked === true)
                  }
                />
                <label
                  htmlFor="allDay-edit"
                  className="text-sm text-muted-foreground cursor-pointer"
                >
                  {t("fields.allDay")}
                </label>
              </div>

              <Field label={t("fields.description")} className="sm:col-span-2">
                <textarea
                  value={form.description || ""}
                  onChange={(e) => handleChange("description", e.target.value)}
                  className={cn(INPUT_CLASS, "min-h-[80px] resize-y")}
                  placeholder={t("placeholders.description")}
                  rows={3}
                />
              </Field>
            </div>
          </div>

          {/* Attendees - show if calendar connected or meeting has attendees */}
          {(isCalendarConnected || form.attendees.length > 0) && (
            <>
              <div className="border-t border-border" />
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("sections.attendees")}
                </h3>
                <AttendeeInput
                  attendees={form.attendees}
                  onChange={(attendees) => handleChange("attendees", attendees)}
                />
                {isSyncedWithGoogle && (
                  <div className="mt-3 flex items-center gap-2">
                    <Checkbox
                      id="sendNotifications-edit"
                      checked={form.sendNotifications}
                      onCheckedChange={(checked) =>
                        handleChange("sendNotifications", checked === true)
                      }
                    />
                    <label
                      htmlFor="sendNotifications-edit"
                      className="text-sm text-muted-foreground cursor-pointer"
                    >
                      {t("edit.notifyChanges")}
                    </label>
                  </div>
                )}
              </div>
            </>
          )}

          {/* CRM Linking */}
          <div className="border-t border-border" />
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("sections.linkToCrm")}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("fields.customer")}>
                <select
                  value={form.customerId || ""}
                  onChange={(e) => handleChange("customerId", e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">{t("placeholders.selectCustomer")}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t("fields.internalNotes")} className="sm:col-span-2">
                <textarea
                  value={form.notes || ""}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  className={cn(INPUT_CLASS, "min-h-[60px] resize-y")}
                  placeholder={t("placeholders.internalNotes")}
                  rows={2}
                />
              </Field>

              <Field label={t("fields.outcome")} className="sm:col-span-2">
                <textarea
                  value={form.notes || ""}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  className={cn(INPUT_CLASS, "min-h-[60px] resize-y")}
                  placeholder={t("placeholders.outcome")}
                  rows={2}
                />
              </Field>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between gap-3 pt-2">
            <div>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {t("edit.deleteConfirm")}
                  </span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deleting ? t("edit.deleting") : t("edit.deleteYes")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    {tCommon("actions.cancel")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  {tCommon("actions.delete")}
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                {tCommon("actions.cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {submitting ? t("edit.submitting") : t("edit.submit")}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
