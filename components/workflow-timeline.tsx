"use client"

import { Download, Check, Loader2, FileArchive } from "lucide-react"
import type { Page, Document, ActivityLogEntry, SegmentationStatus } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { downloadJSON } from "@/lib/export-utils"
import { Progress } from "@/components/ui/progress"
import JSZip from "jszip"

interface WorkflowTimelineProps {
  currentStep: string
  pages?: Page[]
  documents?: Document[]
  activityLog?: ActivityLogEntry[]
  processedPages?: number
  segmentationStatus?: SegmentationStatus
}

export function WorkflowTimeline({
  currentStep,
  pages = [],
  documents = [],
  activityLog = [],
  processedPages = 0,
  segmentationStatus = { isSegmenting: false, documentsGenerated: 0, processingDocuments: false },
}: WorkflowTimelineProps) {
  const hasData = pages.length > 0 && documents.length > 0

  const totalPages = pages.length
  const progressPercentage = totalPages > 0 ? (processedPages / totalPages) * 100 : 0

  const isProcessing = totalPages > 0 && processedPages < totalPages
  const justStarted = totalPages > 0 && processedPages === 0

  const allPagesProcessed = processedPages === totalPages && totalPages > 0

  const handleExportJSON = () => {
    downloadJSON(pages, documents)
  }

  const handleExportZIP = async () => {
    const zip = new JSZip()

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      const docPages = pages.filter((p) => doc.pageIds.includes(p.id))

      if (docPages.length === 0) continue

      // Get document type for filename
      const docType = doc.documentType?.type || `documento_${i + 1}`
      const sanitizedType = docType.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, "_")

      // Create PDF from images using jsPDF
      const { jsPDF } = await import("jspdf")
      const pdf = new jsPDF()

      for (let j = 0; j < docPages.length; j++) {
        const page = docPages[j]
        if (j > 0) pdf.addPage()

        // Load image and add to PDF
        const img = new Image()
        img.crossOrigin = "anonymous"

        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            const imgWidth = pdf.internal.pageSize.getWidth()
            const imgHeight = (img.height * imgWidth) / img.width
            pdf.addImage(img, "JPEG", 0, 0, imgWidth, imgHeight)
            resolve()
          }
          img.onerror = reject
          img.src = page.imageUrl
        })
      }

      // Add PDF to ZIP
      const pdfBlob = pdf.output("blob")
      zip.file(`${sanitizedType}_doc${i + 1}.pdf`, pdfBlob)
    }

    // Generate and download ZIP
    const zipBlob = await zip.generateAsync({ type: "blob" })
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement("a")
    a.href = url
    a.download = "documentos_segmentados.zip"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const scrollToDocument = (docId: string) => {
    const element = document.getElementById(`document-${docId}`)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const totalNonBlankPages = pages.filter((p) => !p.isBlank).length
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
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-foreground">
                {allPagesProcessed ? "Parseado finalizado" : "Parseando páginas..."}
              </h4>
              {allPagesProcessed && <Check className="h-4 w-4 text-green-600" />}
            </div>

            <div className={isProcessing ? "animate-pulse" : ""}>
              <Progress
                value={progressPercentage}
                className={`h-2 ${allPagesProcessed ? "[&>div]:bg-green-600" : ""}`}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Parseadas {processedPages} de {totalPages}
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

        {allPagesProcessed && (segmentationStatus.isSegmenting || segmentationStatus.documentsGenerated > 0) && (
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-foreground">
                {segmentationStatus.isSegmenting ? "Analizando segmentación" : "Segmentación finalizada"}
              </h4>
              {segmentationStatus.isSegmenting ? (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              ) : (
                <Check className="h-4 w-4 text-green-600" />
              )}
            </div>
            {!segmentationStatus.isSegmenting && segmentationStatus.documentsGenerated > 0 && (
              <p className="text-xs text-muted-foreground">
                {segmentationStatus.documentsGenerated}{" "}
                {segmentationStatus.documentsGenerated === 1 ? "documento generado" : "documentos generados"}
              </p>
            )}
          </div>
        )}

        {documents.length > 0 && (
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-foreground">
                {segmentationStatus.processingDocuments ? "Procesando subdocumentos..." : "Subdocumentos generados"}
              </h4>
              {segmentationStatus.processingDocuments ? (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              ) : (
                <Check className="h-4 w-4 text-green-600" />
              )}
            </div>
            <div className="space-y-1">
              {documents.map((doc, index) => {
                const isDocComplete =
                  doc.status === "complete" &&
                  doc.extractedData &&
                  Object.keys(doc.extractedData).length === (doc.fields?.length || 0)

                return (
                  <button
                    key={doc.id}
                    onClick={() => scrollToDocument(doc.id)}
                    className="w-full rounded-md px-3 py-2 text-left text-xs transition-colors hover:bg-muted flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <span className="font-medium">Documento {index + 1}</span>
                      {doc.documentType && (
                        <span className="text-muted-foreground">
                          {" - "}
                          {doc.documentType.type}
                        </span>
                      )}
                    </div>
                    {isDocComplete && <Check className="h-3.5 w-3.5 text-green-600 ml-2 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {canExport && (
          <div className="mt-6 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Exportar Expediente</p>
            <div className="flex flex-col gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleExportJSON}
                className="w-full justify-start gap-2 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportZIP}
                className="w-full justify-start gap-2 text-xs bg-transparent"
              >
                <FileArchive className="h-3.5 w-3.5" />
                Descargar PDFs (ZIP)
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
