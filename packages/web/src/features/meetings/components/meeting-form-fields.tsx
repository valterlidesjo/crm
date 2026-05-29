import { cn } from "@/lib/utils";
import { X, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MeetingFormData } from "../hooks/use-meetings";

export const INPUT_CLASS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm " +
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 " +
  "focus:ring-primary/20 focus:border-primary transition-colors";

interface FieldProps {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, required, className, children }: FieldProps) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

interface AttendeeInputProps {
  attendees: Array<{ email: string; name?: string }>;
  onChange: (attendees: Array<{ email: string; name?: string }>) => void;
}

export function AttendeeInput({ attendees, onChange }: AttendeeInputProps) {
  const { t } = useTranslation("meetings");
  const addAttendee = () => {
    onChange([...attendees, { email: "", name: "" }]);
  };

  const removeAttendee = (index: number) => {
    onChange(attendees.filter((_, i) => i !== index));
  };

  const updateAttendee = (
    index: number,
    field: "email" | "name",
    value: string
  ) => {
    const updated = [...attendees];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      {attendees.map((attendee, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="email"
            value={attendee.email}
            onChange={(e) => updateAttendee(index, "email", e.target.value)}
            className={cn(INPUT_CLASS, "flex-1")}
            placeholder={t("attendeeInput.emailPlaceholder")}
          />
          <input
            type="text"
            value={attendee.name || ""}
            onChange={(e) => updateAttendee(index, "name", e.target.value)}
            className={cn(INPUT_CLASS, "w-40")}
            placeholder={t("attendeeInput.namePlaceholder")}
          />
          <button
            type="button"
            onClick={() => removeAttendee(index)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addAttendee}
        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="h-4 w-4" />
        {t("attendeeInput.add")}
      </button>
    </div>
  );
}

export const INITIAL_MEETING_FORM: MeetingFormData = {
  title: "",
  description: "",
  location: "",
  startTime: "",
  endTime: "",
  allDay: false,
  attendees: [],
  customerId: "",
  dealId: "",
  contactId: "",
  notes: "",
  sendNotifications: true,
};

/**
 * Get default start/end times for a new meeting (next hour, 1 hour duration)
 */
export function getDefaultMeetingTimes(): { startTime: string; endTime: string } {
  const now = new Date();
  // Round up to next hour
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);

  const start = now.toISOString().slice(0, 16);
  now.setHours(now.getHours() + 1);
  const end = now.toISOString().slice(0, 16);

  return { startTime: start, endTime: end };
}
