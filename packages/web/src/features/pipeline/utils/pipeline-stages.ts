import type { CustomerStatusType } from "@crm/shared";

export interface PipelineStage {
  id: string;
  statuses: CustomerStatusType[];
  color: string;
  bgColor: string;
  dropBgColor: string;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: "prospecting",
    statuses: ["not_contacted"],
    color: "bg-gray-500",
    bgColor: "bg-gray-50",
    dropBgColor: "bg-gray-100",
  },
  {
    id: "contacted",
    statuses: ["contacted", "warm"],
    color: "bg-blue-500",
    bgColor: "bg-blue-50",
    dropBgColor: "bg-blue-100",
  },
  {
    id: "in_progress",
    statuses: ["in_progress"],
    color: "bg-yellow-500",
    bgColor: "bg-yellow-50",
    dropBgColor: "bg-yellow-100",
  },
  {
    id: "deal_closed",
    statuses: ["mrr", "completed"],
    color: "bg-green-500",
    bgColor: "bg-green-50",
    dropBgColor: "bg-green-100",
  },
];

export const LOST_STAGE: PipelineStage = {
  id: "lost",
  statuses: ["lost"],
  color: "bg-red-500",
  bgColor: "bg-red-50",
  dropBgColor: "bg-red-100",
};

/** Map a stage ID to the default status customers should get when dropped into it */
export const STAGE_DEFAULT_STATUS: Record<string, CustomerStatusType> = {
  prospecting: "not_contacted",
  contacted: "contacted",
  in_progress: "in_progress",
  deal_closed: "completed",
  lost: "lost",
};

export function getStageForStatus(status: CustomerStatusType): string {
  for (const stage of PIPELINE_STAGES) {
    if (stage.statuses.includes(status)) return stage.id;
  }
  if (LOST_STAGE.statuses.includes(status)) return LOST_STAGE.id;
  return "prospecting";
}
