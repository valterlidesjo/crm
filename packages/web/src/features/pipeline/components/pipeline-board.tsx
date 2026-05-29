import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { Customer, CustomerStatusType } from "@crm/shared";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PIPELINE_STAGES,
  LOST_STAGE,
  STAGE_DEFAULT_STATUS,
  getStageForStatus,
} from "../utils/pipeline-stages";
import { PipelineColumn } from "./pipeline-column";
import { PipelineCard } from "./pipeline-card";

interface PipelineBoardProps {
  customers: Customer[];
  loading: boolean;
  onUpdateStatus: (customerId: string, newStatus: CustomerStatusType) => void;
}

export function PipelineBoard({
  customers,
  loading,
  onUpdateStatus,
}: PipelineBoardProps) {
  const { t } = useTranslation("pipeline");
  const [search, setSearch] = useState("");
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [lostExpanded, setLostExpanded] = useState(false);
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, CustomerStatusType>>({});

  // Prune optimistic statuses once the real customer data catches up.
  // Intentional reconcile of local state against incoming props.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptimisticStatuses((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      for (const customer of customers) {
        if (next[customer.id] === customer.status) {
          delete next[customer.id];
        }
      }
      return next;
    });
  }, [customers]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.categoryOfWork.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q)
    );
  }, [customers, search]);

  const grouped = useMemo(() => {
    const map: Record<string, Customer[]> = {};
    for (const stage of PIPELINE_STAGES) {
      map[stage.id] = [];
    }
    map[LOST_STAGE.id] = [];

    for (const customer of filtered) {
      const effectiveStatus = optimisticStatuses[customer.id] ?? customer.status;
      const stageId = getStageForStatus(effectiveStatus);
      if (map[stageId]) {
        map[stageId].push(customer);
      }
    }
    return map;
  }, [filtered, optimisticStatuses]);

  function handleDragStart(event: DragStartEvent) {
    const customer = customers.find((c) => c.id === event.active.id);
    setActiveCustomer(customer ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCustomer(null);
    const { active, over } = event;
    if (!over) return;

    const customerId = active.id as string;
    const targetStageId = over.id as string;
    const newStatus = STAGE_DEFAULT_STATUS[targetStageId];
    if (!newStatus) return;

    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;

    const currentStage = getStageForStatus(optimisticStatuses[customerId] ?? customer.status);
    if (currentStage === targetStageId) return;

    setOptimisticStatuses((prev) => ({ ...prev, [customerId]: newStatus }));
    onUpdateStatus(customerId, newStatus);
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">{t("board.loading")}</p>
    );
  }

  const lostCustomers = grouped[LOST_STAGE.id] ?? [];

  return (
    <div className="space-y-4">
      {/* Search + summary */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("board.searchPlaceholder")}
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {PIPELINE_STAGES.map((stage) => (
            <span key={stage.id} className="flex items-center gap-1">
              <span className={cn("h-2 w-2 rounded-full", stage.color)} />
              {t("board.summary", { label: t(`stage.${stage.id}`), count: (grouped[stage.id] ?? []).length })}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-full", LOST_STAGE.color)} />
            {t("board.summary", { label: t("stage.lost"), count: lostCustomers.length })}
          </span>
        </div>
      </div>

      {/* Kanban board */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map((stage) => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              customers={grouped[stage.id] ?? []}
            />
          ))}
        </div>

        {/* Lost section */}
        <div className="rounded-lg border border-border">
          <button
            onClick={() => setLostExpanded(!lostExpanded)}
            className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {lostExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className={cn("h-2.5 w-2.5 rounded-full", LOST_STAGE.color)} />
            {t("board.lostCount", { count: lostCustomers.length })}
          </button>
          {lostExpanded && (
            <div className="border-t border-border px-4 py-3">
              {lostCustomers.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  {t("board.noLostCustomers")}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {lostCustomers.map((customer) => (
                    <PipelineCard key={customer.id} customer={customer} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DragOverlay>
          {activeCustomer ? (
            <div className="w-[260px]">
              <PipelineCard customer={activeCustomer} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
