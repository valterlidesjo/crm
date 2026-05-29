import type { Meeting } from "@crm/shared";
import { useTranslation } from "react-i18next";
import { currentLocale } from "@/i18n";
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  CalendarCheck,
  MoreHorizontal,
} from "lucide-react";

interface MeetingListProps {
  meetings: Meeting[];
  loading: boolean;
  onEdit: (meeting: Meeting) => void;
  customers?: Map<string, string>; // id -> name mapping
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString(currentLocale(), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isPast(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

export function MeetingList({
  meetings,
  loading,
  onEdit,
  customers,
}: MeetingListProps) {
  const { t } = useTranslation("meetings");
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12">
        <Calendar className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-medium text-foreground">
          {t("list.emptyTitle")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("list.emptyDescription")}
        </p>
      </div>
    );
  }

  // Group meetings by date
  const groupedMeetings = meetings.reduce(
    (acc, meeting) => {
      const dateKey = new Date(meeting.startTime).toDateString();
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(meeting);
      return acc;
    },
    {} as Record<string, Meeting[]>
  );

  // Sort dates
  const sortedDates = Object.keys(groupedMeetings).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  return (
    <div className="space-y-6">
      {sortedDates.map((dateKey) => {
        const dateMeetings = groupedMeetings[dateKey];
        const dateObj = new Date(dateKey);
        const todayClass = isToday(dateKey) ? "text-primary font-semibold" : "";

        return (
          <div key={dateKey}>
            <h3
              className={`mb-3 text-sm font-medium text-muted-foreground ${todayClass}`}
            >
              {isToday(dateKey)
                ? t("list.today")
                : dateObj.toLocaleDateString(currentLocale(), {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
            </h3>
            <div className="space-y-2">
              {dateMeetings.map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  onEdit={() => onEdit(meeting)}
                  customerName={
                    meeting.customerId
                      ? customers?.get(meeting.customerId)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface MeetingCardProps {
  meeting: Meeting;
  onEdit: () => void;
  customerName?: string;
}

function MeetingCard({ meeting, onEdit, customerName }: MeetingCardProps) {
  const { t } = useTranslation("meetings");
  const past = isPast(meeting.endTime);
  const isSynced = !!meeting.googleCalendarEventId;

  return (
    <div
      className={`group relative rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-sm cursor-pointer ${
        past ? "opacity-60" : ""
      }`}
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Title and sync indicator */}
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-foreground truncate">
              {meeting.title}
            </h4>
            {isSynced && (
              <CalendarCheck className="h-4 w-4 text-green-600 flex-shrink-0" />
            )}
          </div>

          {/* Time */}
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 flex-shrink-0" />
            {meeting.allDay ? (
              <span>{t("list.allDay")}</span>
            ) : (
              <span>
                {formatTime(meeting.startTime)} - {formatTime(meeting.endTime)}
              </span>
            )}
          </div>

          {/* Location */}
          {meeting.location && (
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{meeting.location}</span>
            </div>
          )}

          {/* Attendees count */}
          {meeting.attendees && meeting.attendees.length > 0 && (
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4 flex-shrink-0" />
              <span>
                {t("list.attendees", { count: meeting.attendees.length })}
              </span>
            </div>
          )}

          {/* Customer link */}
          {customerName && (
            <div className="mt-2">
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {customerName}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="rounded-md p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-all"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
