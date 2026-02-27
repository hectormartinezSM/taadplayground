"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Document, Page } from "@/lib/types"
import { FieldsTable } from "./fields-table"
import { DNIRevisions } from "./dni-revisions"
import { FileText, Loader2, Download, CheckCircle2 } from "lucide-react"
import { ImageViewer } from "./image-viewer"
import { Button } from "@/components/ui/button"
import { jsPDF } from "jspdf"
import { downloadDocumentJSON, downloadDocumentCSV } from "@/lib/export-utils"
import { CotejosInterdocumentales } from "./cotejos-interdocumentales"
import { runCotejosInterdocumentales } from "@/lib/cotejos-validation"
import type { Cotejo } from "@/lib/types"
import { useMemo } from "react"

interface DocumentListProps {
  documents: Document[]
  pages: Page[]
  updateDocuments: (documents: Document[]) => void
  addActivityLog: (entry: { type: string; message: string }) => void
}

export function DocumentList({ documents, pages, updateDocuments, addActivityLog }: DocumentListProps) {
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerImages, setViewerImages] = useState<string[]>([])
  const [viewerLabels, setViewerLabels] = useState<string[]>([])
  const [viewerIndex, setViewerIndex] = useState(0)

  // Calculate cotejos interdocumentales when all documents are complete
  const cotejos: Cotejo[] = useMemo(() => {
    return runCotejosInterdocumentales(documents)
  }, [documents])

  const handlePageClick = (docPages: Page[], clickedIndex: number) => {
    setViewerImages(docPages.map((p) => p.imageUrl))
    setViewerLabels(docPages.map((p, idx) => `Página ${idx + 1} de ${docPages.length}`))
    setViewerIndex(clickedIndex)
    setViewerOpen(true)
  }

  const handleDownloadPDF = async (doc: Document, docIndex: number) => {
    try {
      const docPages = pages.filter((p) => doc.pageIds.includes(p.id))

      // Create a new PDF document
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      })

      // Add each page image to the PDF
      for (let i = 0; i < docPages.length; i++) {
        if (i > 0) {
          pdf.addPage()
        }

        const imgData = docPages[i].imageUrl
        const imgWidth = 210 // A4 width in mm
        const imgHeight = 297 // A4 height in mm

        pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight)
      }

      // Download the PDF
      const fileName = `Documento_${docIndex + 1}_${doc.documentType?.type || "Desconocido"}.pdf`
      pdf.save(fileName)

      addActivityLog({
        type: "field_extracted",
        message: `Documento ${docIndex + 1} descargado como PDF`,
      })
    } catch (error) {
      console.error("[v0] Error generating PDF:", error)
    }
  }

  const handleDownloadDocumentJSON = (doc: Document, docIndex: number) => {
    const docPages = pages.filter((p) => doc.pageIds.includes(p.id))
    const extractedFields: Record<string, string> = {}

    if (doc.extractedData) {
      Object.entries(doc.extractedData).forEach(([key, value]) => {
        extractedFields[key] = value.value
      })
    }

    const exportDoc = {
      documentId: doc.id,
      type: doc.documentType?.type || "Unknown",
      pageNumbers: docPages.map((p) => p.index + 1),
      fields: extractedFields,
    }

    downloadDocumentJSON(exportDoc, docIndex)
  }

  const handleDownloadDocumentCSV = (doc: Document, docIndex: number) => {
    const docPages = pages.filter((p) => doc.pageIds.includes(p.id))
    const extractedFields: Record<string, string> = {}

    if (doc.extractedData) {
      Object.entries(doc.extractedData).forEach(([key, value]) => {
        extractedFields[key] = value.value
      })
    }

    const exportDoc = {
      documentId: doc.id,
      type: doc.documentType?.type || "Unknown",
      pageNumbers: docPages.map((p) => p.index + 1),
      fields: extractedFields,
    }

    downloadDocumentCSV(exportDoc, docIndex)
  }

  const handleAddCustomField = async (docId: string, fieldName: string, documentType: string) => {
    try {
      console.log("[v0] Adding custom field:", fieldName, "to document", docId)

      const docIndex = documents.findIndex((d) => d.id === docId)
      if (docIndex === -1) return

      const doc = documents[docIndex]
      const docPages = pages.filter((p) => doc.pageIds.includes(p.id))

      // Get stored markdown from sessionStorage if available
      const storedMarkdown = sessionStorage.getItem(`doc-${docId}-markdown`)

      if (!storedMarkdown) {
        console.error("[v0] No markdown found for document")
        return
      }

      // Extract the custom field
      const response = await fetch("/api/extract-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: storedMarkdown,
          fields: [fieldName],
          documentType,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const fieldData = data.extractedData[fieldName]

        if (fieldData) {
          // Update current document
          const updatedDocs = [...documents]
          updatedDocs[docIndex] = {
            ...updatedDocs[docIndex],
            fields: [...(updatedDocs[docIndex].fields || []), { name: fieldName }],
            extractedData: {
              ...updatedDocs[docIndex].extractedData,
              [fieldName]: fieldData,
            },
          }

          for (let i = 0; i < updatedDocs.length; i++) {
            if (i !== docIndex && updatedDocs[i].documentType?.type === documentType) {
              const otherDocMarkdown = sessionStorage.getItem(`doc-${updatedDocs[i].id}-markdown`)

              if (otherDocMarkdown) {
                // Extract field for this document too
                const otherResponse = await fetch("/api/extract-fields", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    markdown: otherDocMarkdown,
                    fields: [fieldName],
                    documentType,
                  }),
                })

                if (otherResponse.ok) {
                  const otherData = await otherResponse.json()
                  const otherFieldData = otherData.extractedData[fieldName]

                  if (otherFieldData) {
                    updatedDocs[i] = {
                      ...updatedDocs[i],
                      fields: [...(updatedDocs[i].fields || []), { name: fieldName }],
                      extractedData: {
                        ...updatedDocs[i].extractedData,
                        [fieldName]: otherFieldData,
                      },
                    }
                  }
                }
              }
            }
          }

          updateDocuments(updatedDocs)

          addActivityLog({
            type: "field_extracted",
            message: `Campo personalizado '${fieldName}' añadido a todos los documentos de tipo ${documentType}`,
          })
        }
      }
    } catch (error) {
      console.error("[v0] Error adding custom field:", error)
    }
  }

  return (
    <>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground">Documentos Procesados</h2>

        {documents.map((doc, index) => {
          const docPages = pages ? pages.filter((p) => doc.pageIds.includes(p.id)) : []

          return (
            <Card key={doc.id} id={`document-${doc.id}`} className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="border-b px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shadow-sm">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-semibold">
                          Documento {index + 1}
                          {doc.documentType && ` - ${doc.documentType.type}`}
                        </CardTitle>
                        {doc.documentType && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Tipología válida
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {docPages.length} {docPages.length === 1 ? "página" : "páginas"}
                      </p>
                    </div>
                  </div>

                  {doc.status === "complete" && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadPDF(doc, index)}
                        className="gap-2 shadow-xs hover:shadow-sm"
                      >
                        <Download className="h-4 w-4" />
                        PDF
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadDocumentJSON(doc, index)}
                        className="gap-2 shadow-xs hover:shadow-sm"
                      >
                        <Download className="h-4 w-4" />
                        JSON
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadDocumentCSV(doc, index)}
                        className="gap-2 shadow-xs hover:shadow-sm"
                      >
                        <Download className="h-4 w-4" />
                        CSV
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                {/* Page Thumbnails */}
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {docPages.map((page, pageIndex) => (
                    <div
                      key={page.id}
                      className="relative flex-shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border transition-all hover:scale-105 hover:shadow-md shadow-sm"
                      onClick={() => handlePageClick(docPages, pageIndex)}
                    >
                      <img
                        src={page.imageUrl || "/placeholder.svg"}
                        alt={`Página ${pageIndex + 1}`}
                        className="h-20 w-15 object-cover"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center">
                        <span className="text-[10px] font-medium text-white">{pageIndex + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Status Indicators */}
                {doc.status === "classifying" && !doc.documentType && (
                  <div className="flex items-center gap-3 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Clasificando documento...</span>
                  </div>
                )}

                {doc.status === "classifying" && doc.documentType && !doc.fields && (
                  <div className="flex items-center gap-3 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Detectando campos relevantes...</span>
                  </div>
                )}

                {doc.status === "extracting" && (
                  <div className="flex items-center gap-3 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Extrayendo campos...</span>
                  </div>
                )}

                {/* Fields Table */}
                {doc.fields && (
                  <FieldsTable
                    fields={doc.fields}
                    extractedData={doc.extractedData}
                    isExtracting={doc.status === "extracting"}
                    isComplete={doc.status === "complete"}
                    onAddCustomField={
                      doc.status === "complete" && doc.documentType
                        ? (fieldName) => handleAddCustomField(doc.id, fieldName, doc.documentType!.type)
                        : undefined
                    }
                  />
                )}

                {/* Validations - Show for documents with revisions when complete */}
                {doc.status === "complete" && 
                 doc.revisiones && 
                 doc.revisiones.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-base font-semibold text-foreground">Revisiones Intradocumentales</h3>
                    <DNIRevisions revisiones={doc.revisiones} />
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Cotejos Interdocumentales - shown below all documents when complete */}
      {cotejos.length > 0 && (
        <div className="mt-8">
          <CotejosInterdocumentales cotejos={cotejos} />
        </div>
      )}

      {viewerOpen && (
        <ImageViewer
          images={viewerImages}
          initialIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
          pageLabels={viewerLabels}
        />
      )}
    </>
  )
}
