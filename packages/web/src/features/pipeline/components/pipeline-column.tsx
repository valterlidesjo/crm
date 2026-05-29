import { useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import type { Customer } from "@crm/shared";
import type { PipelineStage } from "../utils/pipeline-stages";
import { PipelineCard } from "./pipeline-card";
import { cn } from "@/lib/utils";

interface PipelineColumnProps {
  stage: PipelineStage;
  customers: Customer[];
}

export function PipelineColumn({ stage, customers }: PipelineColumnProps) {
  const { t } = useTranslation("pipeline");
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div className="flex flex-col min-w-[280px] w-[280px] shrink-0">
      {/* Column header */}
      <div className="mb-3 flex items-center gap-2">
        <div className={cn("h-3 w-3 rounded-full", stage.color)} />
        <h3 className="text-sm font-semibold text-foreground">{t(`stage.${stage.id}`)}</h3>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {customers.length}
        </span>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 rounded-lg border-2 border-dashed border-transparent p-2 space-y-2 transition-colors min-h-[200px]",
          stage.bgColor,
          isOver && cn(stage.dropBgColor, "border-border")
        )}
      >
        {customers.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {t("board.noCustomers")}
          </p>
        ) : (
          customers.map((customer) => (
            <PipelineCard key={customer.id} customer={customer} />
          ))
        )}
      </div>
    </div>
  );
}
