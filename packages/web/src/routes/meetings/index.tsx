import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/page-container";
import { MeetingList } from "@/features/meetings/components/meeting-list";
import { AddMeetingDialog } from "@/features/meetings/components/add-meeting-dialog";
import { EditMeetingDialog } from "@/features/meetings/components/edit-meeting-dialog";
import { useMeetings } from "@/features/meetings/hooks/use-meetings";
import { useGoogleCalendarAuth } from "@/lib/google-calendar";
import { useCustomers } from "@/features/customers/hooks/use-customers";
import { CalendarDays, Plus, RefreshCw, AlertCircle } from "lucide-react";
import type { Meeting } from "@crm/shared";

export const Route = createFileRoute("/meetings/")({
  component: MeetingsPage,
});

function MeetingsPage() {
  const { t } = useTranslation("meetings");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);

  const {
    meetings,
    loading,
    syncing,
    addMeeting,
    updateMeeting,
    deleteMeeting,
    syncFromGoogleCalendar,
  } = useMeetings();

  const {
    isAuthorized,
    isLoading: authLoading,
    authorize,
    error: authError,
    clearError,
  } = useGoogleCalendarAuth();

  const { customers } = useCustomers();

  // Create customer name mapping
  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  // Auto-sync on mount when authorized
  useEffect(() => {
    if (isAuthorized && !authLoading) {
      syncFromGoogleCalendar();
    }
  }, [isAuthorized, authLoading, syncFromGoogleCalendar]);

  const handleAddMeeting = async (data: Parameters<typeof addMeeting>[0]) => {
    await addMeeting(data);
    setAddDialogOpen(false);
  };

  const handleUpdateMeeting = async (
    id: string,
    data: Parameters<typeof updateMeeting>[1]
  ) => {
    await updateMeeting(id, data);
    setEditMeeting(null);
  };

  const handleDeleteMeeting = async (id: string) => {
    await deleteMeeting(id);
    setEditMeeting(null);
  };

  const handleAuthorize = async () => {
    clearError();
    await authorize();
  };

  return (
    <PageContainer
      title={t("page.title")}
      description={t("page.description")}
    >
      {/* Google Calendar Authorization Banner */}
      {!authLoading && !isAuthorized && (
        <div className="mb-6 flex items-start justify-between rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
            <div className="flex-1">
              <p className="font-medium text-blue-900">
                {t("connectBanner.title")}
              </p>
              <p className="mt-0.5 text-sm text-blue-700">
                {t("connectBanner.description")}
              </p>
            </div>
          </div>
          <button
            onClick={handleAuthorize}
            className="ml-4 flex-shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            {t("connectBanner.button")}
          </button>
        </div>
      )}

      {/* Error Banner */}
      {authError && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">
              {t("errorBanner.title")}
            </p>
            <p className="mt-0.5 text-sm text-red-700">{authError}</p>
          </div>
          <button
            onClick={clearError}
            className="text-red-600 hover:text-red-800 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* Actions Bar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAddDialogOpen(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("actions.schedule")}
          </button>

          {isAuthorized && (
            <button
              onClick={() => syncFromGoogleCalendar()}
              disabled={syncing}
              className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? t("actions.syncing") : t("actions.sync")}
            </button>
          )}
        </div>

        {/* Meeting count */}
        <div className="text-sm text-muted-foreground">
          {t("count", { count: meetings.length })}
        </div>
      </div>

      {/* Meetings List */}
      <MeetingList
        meetings={meetings}
        loading={loading}
        onEdit={setEditMeeting}
        customers={customerMap}
      />

      {/* Dialogs */}
      <AddMeetingDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSubmit={handleAddMeeting}
        isCalendarConnected={isAuthorized}
      />

      {editMeeting && (
        <EditMeetingDialog
          key={editMeeting.id}
          open={!!editMeeting}
          onOpenChange={() => setEditMeeting(null)}
          meeting={editMeeting}
          onSubmit={(data) => handleUpdateMeeting(editMeeting.id, data)}
          onDelete={() => handleDeleteMeeting(editMeeting.id)}
          isCalendarConnected={isAuthorized}
        />
      )}
    </PageContainer>
  );
}
