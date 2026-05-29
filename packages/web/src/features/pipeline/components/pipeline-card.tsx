import { useDraggable } from "@dnd-kit/core";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Customer } from "@crm/shared";
import { cn } from "@/lib/utils";
import { GripVertical, MapPin, Briefcase } from "lucide-react";

interface PipelineCardProps {
  customer: Customer;
}

export function PipelineCard({ customer }: PipelineCardProps) {
  const { t } = useTranslation("customers");
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: customer.id });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-lg border border-border bg-white p-3 shadow-sm transition-shadow hover:shadow-md",
        isDragging && "opacity-0 pointer-events-none"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...listeners}
          {...attributes}
          className="mt-0.5 cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() =>
            navigate({ to: "/customers/$customerId", params: { customerId: customer.id } })
          }
        >
          <p className="font-medium text-sm truncate">{customer.name}</p>

          <div className="mt-1.5 flex flex-col gap-1">
            {customer.categoryOfWork && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Briefcase className="h-3 w-3 shrink-0" />
                <span className="truncate">{customer.categoryOfWork}</span>
              </span>
            )}
            {customer.location && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{customer.location}</span>
              </span>
            )}
          </div>

          <div className="mt-2">
            <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t(`status.${customer.status}`)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
