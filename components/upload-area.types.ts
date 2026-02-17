import type { Page, ActivityLogEntry, WorkflowStep, UseCase } from "@/lib/types"

export interface UploadAreaProps {
  onFileUpload: (pages: Page[], useCase: UseCase) => void
  updateWorkflowStep: (step: WorkflowStep) => void
  addActivityLog: (entry: Omit<ActivityLogEntry, "id" | "timestamp">) => void
}
