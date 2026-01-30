"use client"

import { Download } from "lucide-react"
import type { Page, Document, ActivityLogEntry } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { prepareExportData, downloadJSON, downloadCSV } from "@/lib/export-utils"
import { Progress } from "@/components/ui/progress"

interface WorkflowTimelineProps {
  currentStep: string
  pages?: Page[]
  documents?: Document[]
  activityLog?: ActivityLogEntry[]
  processedPages?: number
}

export function WorkflowTimeline({
  currentStep,
  pages = [],
  documents = [],
  activityLog = [],
  processedPages = 0,
}: WorkflowTimelineProps) {
  const hasData = pages.length > 0 && documents.length > 0

  const totalPages = pages.length
  const progressPercentage = totalPages > 0 ? (processedPages / totalPages) * 100 : 0

  const isProcessing = totalPages > 0 && processedPages < totalPages
  const justStarted = totalPages > 0 && processedPages === 0

  const handleExportJSON = () => {
    const data = prepareExportData(pages, documents, activityLog)
    downloadJSON(data)
  }

  const handleExportCSV = () => {
    const data = prepareExportData(pages, documents, activityLog)
    downloadCSV(data)
  }

  const scrollToDocument = (docId: string) => {
    const element = document.getElementById(`document-${docId}`)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const totalNonBlankPages = pages.filter((p) => !p.isBlank).length
  const allPagesProcessed = processedPages === totalPages
  const allDocumentsComplete =
    documents.length > 0 &&
    documents.every(
      (doc) =>
        doc.status === "complete" &&
        doc.extractedData &&
        Object.keys(doc.extractedData).length === (doc.fields?.length || 0),
    )

  const canExport = hasData && allPagesProcessed && allDocumentsComplete

  return (
    <div className="space-y-6">
      <div>
        {totalPages > 0 && (
          <div className="space-y-2">
            <div className={isProcessing ? "animate-pulse" : ""}>
              <Progress value={progressPercentage} className="h-2" />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Procesadas {processedPages} de {totalPages} páginas
              </p>
              {isProcessing && (
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:0.2s]" />
                  <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:0.4s]" />
                </div>
              )}
            </div>
            {justStarted && (
              <div className="mt-2 space-y-2">
                <div className="h-8 w-full rounded-md bg-muted/50 animate-pulse" />
                <div className="h-8 w-3/4 rounded-md bg-muted/30 animate-pulse [animation-delay:0.1s]" />
              </div>
            )}
          </div>
        )}

        {documents.length > 0 && (
          <div className="mt-6 space-y-2">
            <h4 className="text-xs font-semibold text-foreground">Docs. Individuales Generados</h4>
            <div className="space-y-1">
              {documents.map((doc, index) => (
                <button
                  key={doc.id}
                  onClick={() => scrollToDocument(doc.id)}
                  className="w-full rounded-md px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                >
                  <span className="font-medium">Documento {index + 1}</span>
                  {doc.documentType && (
                    <span className="text-muted-foreground">
                      {" - "}
                      {doc.documentType.type}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {canExport && (
          <div className="mt-6 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Exportar Datos</p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportJSON}
                className="w-full justify-start gap-2 text-xs bg-transparent"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="w-full justify-start gap-2 text-xs bg-transparent"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar CSV
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
