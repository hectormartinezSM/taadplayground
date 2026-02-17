import type { Page, ActivityLogEntry, WorkflowStep } from "@/lib/types"

export interface UploadAreaProps {
  onFileUpload: (pages: Page[]) => void
  updateWorkflowStep: (step: WorkflowStep) => void
  addActivityLog: (entry: Omit<ActivityLogEntry, "id" | "timestamp">) => void
}
