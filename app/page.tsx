"use client"

import { useState } from "react"
import { UploadArea } from "@/components/upload-area"
import { WorkflowTimeline } from "@/components/workflow-timeline"
import { PageGrid } from "@/components/page-grid"
import { DocumentList } from "@/components/document-list"
import { ActivityLog } from "@/components/activity-log"
import type { Page, Document, ActivityLogEntry, WorkflowStep, SegmentationStatus } from "@/lib/types"
import { ChevronLeft, ChevronRight, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { LocaleProvider, useLocale } from "@/lib/locale-context"

export default function Home() {
  return (
    <LocaleProvider>
      <HomeContent />
    </LocaleProvider>
  )
}

function HomeContent() {
  const { locale, setLocale, t } = useLocale()
  const [pages, setPages] = useState<Page[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [currentStep, setCurrentStep] = useState<WorkflowStep>("upload")
  const [isProcessing, setIsProcessing] = useState(false)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  const [processedPages, setProcessedPages] = useState(0)
  const [segmentationStatus, setSegmentationStatus] = useState<SegmentationStatus>({
    isSegmenting: false,
    documentsGenerated: 0,
    processingDocuments: false,
  })
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  const handleReset = () => {
    setPages([])
    setDocuments([])
    setActivityLog([])
    setCurrentStep("upload")
    setIsProcessing(false)
    setLeftSidebarOpen(false)
    setRightSidebarOpen(false)
    setProcessedPages(0)
    setSegmentationStatus({ isSegmenting: false, documentsGenerated: 0, processingDocuments: false })
    setCanScrollUp(false)
    setCanScrollDown(false)
  }

  const handleFileUpload = (uploadedPages: Page[]) => {
    setPages(uploadedPages)
    setDocuments([])
    setActivityLog([])
    setIsProcessing(true)
    setLeftSidebarOpen(true)
    setRightSidebarOpen(true)
  }

  const updatePages = (updatedPages: Page[]) => {
    setPages(updatedPages)
  }

  const updateDocuments = (updatedDocs: Document[]) => {
    setDocuments(updatedDocs)
  }

  const addActivityLog = (entry: Omit<ActivityLogEntry, "id" | "timestamp">) => {
    const newEntry: ActivityLogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }
    setActivityLog((prev) => [newEntry, ...prev])
  }

  const updateWorkflowStep = (step: WorkflowStep) => {
    setCurrentStep(step)
  }

  const handleScrollUp = () => {
    const container = document.getElementById("activity-log-container")
    if (container) {
      container.scrollBy({ top: -200, behavior: "smooth" })
    }
  }

  const handleScrollDown = () => {
    const container = document.getElementById("activity-log-container")
    if (container) {
      container.scrollBy({ top: 200, behavior: "smooth" })
    }
  }

  const checkScrollPosition = () => {
    const container = document.getElementById("activity-log-container")
    if (container) {
      setCanScrollUp(container.scrollTop > 0)
      setCanScrollDown(container.scrollTop < container.scrollHeight - container.clientHeight - 10)
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Navbar - Full Width */}
      <header className="border-b bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleReset}
              className="hover:opacity-80 transition-opacity"
              aria-label={t("Volver a la página inicial", "Back to home")}
            >
              <Image
                src="/images/design-mode/Serimag_logo_color-1-scaled.png"
                alt="Serimag"
                width={150}
                height={50}
                className="h-10 w-auto object-contain"
                priority
              />
            </button>
            <div className="border-l pl-4">
              <h1 className="text-3xl font-bold text-foreground">playground</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center rounded-md border bg-muted/30 p-0.5">
              <button
                onClick={() => setLocale("es")}
                className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                  locale === "es"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                ES
              </button>
              <button
                onClick={() => setLocale("en")}
                className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                  locale === "en"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content Area with Sidebars */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar - Workflow Progress */}
        <div
          className={`flex-shrink-0 border-r bg-card transition-all duration-300 ${
            leftSidebarOpen ? "w-64" : "w-0"
          } overflow-hidden`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-4 py-4 bg-card">
              <h2 className="text-sm font-semibold text-foreground">{t("Etapas del Proceso", "Process Stages")}</h2>
              <Button variant="ghost" size="icon-sm" onClick={() => setLeftSidebarOpen(false)} className="h-7 w-7">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <WorkflowTimeline
                currentStep={currentStep}
                pages={pages}
                documents={documents}
                activityLog={activityLog}
                processedPages={processedPages}
                segmentationStatus={segmentationStatus}
              />
            </div>
          </div>
        </div>

        {/* Toggle button with label when left sidebar is closed */}
        {!leftSidebarOpen && isProcessing && (
          <div className="absolute left-4 top-6 z-10">
            <button
              onClick={() => setLeftSidebarOpen(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <span>{t("Etapas del Proceso", "Process Stages")}</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-background">
          {pages.length === 0 ? (
            <div className="h-full px-6 py-8 md:px-12 md:py-12">
              <div className="w-full max-w-6xl mx-auto">
                <UploadArea
                  onFileUpload={handleFileUpload}
                  updateWorkflowStep={updateWorkflowStep}
                  addActivityLog={addActivityLog}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-8 p-6 md:p-8">
              <PageGrid
                pages={pages}
                documents={documents}
                updatePages={updatePages}
                updateDocuments={updateDocuments}
                addActivityLog={addActivityLog}
                updateCurrentStep={updateWorkflowStep}
                updateProcessing={setIsProcessing}
                isProcessing={isProcessing}
                processedPages={processedPages}
                setProcessedPages={setProcessedPages}
                setSegmentationStatus={setSegmentationStatus}
              />

              {documents.length > 0 && (
                <DocumentList
                  documents={documents}
                  pages={pages}
                  updateDocuments={updateDocuments}
                  addActivityLog={addActivityLog}
                  updateWorkflowStep={updateWorkflowStep}
                />
              )}
            </div>
          )}
        </main>

        {/* Right Sidebar - Activity Log */}
        <div
          className={`flex-shrink-0 border-l bg-card transition-all duration-300 ${
            rightSidebarOpen ? "w-80" : "w-0"
          } overflow-hidden`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-4 py-4 bg-card">
              <h2 className="text-sm font-semibold text-foreground">{t("Registro de Actividad", "Activity Log")}</h2>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setRightSidebarOpen(false)}
                className="h-7 w-7 ml-auto"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 relative">
              <div
                className="h-full overflow-y-auto p-4 scrollbar-hide"
                id="activity-log-container"
                onScroll={checkScrollPosition}
              >
                <ActivityLog entries={activityLog} />
              </div>

              {canScrollUp && (
                <button
                  onClick={handleScrollUp}
                  className="absolute top-16 left-0 right-0 h-12 bg-gradient-to-b from-card via-card/80 to-transparent flex items-start justify-center pt-2 hover:from-card hover:via-card/90 transition-colors z-10"
                  aria-label="Scroll up"
                >
                  <ChevronRight className="h-4 w-4 text-primary -rotate-90" />
                </button>
              )}

              {canScrollDown && (
                <button
                  onClick={handleScrollDown}
                  className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card via-card/80 to-transparent flex items-end justify-center pb-2 hover:from-card hover:via-card/90 transition-colors z-10"
                  aria-label="Scroll down"
                >
                  <ChevronRight className="h-4 w-4 text-primary rotate-90" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Toggle button when right sidebar is closed */}
        {!rightSidebarOpen && isProcessing && (
          <div className="absolute right-4 top-6 z-10">
            <button
              onClick={() => setRightSidebarOpen(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="h-3 w-3" />
              <span>{t("Registro de Actividad", "Activity Log")}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
