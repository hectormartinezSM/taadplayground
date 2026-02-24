"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import type { Page, Document, ExtractedField, SegmentationProgress, SegmentationStatus } from "@/lib/types"
import { mockGetRelevantFields } from "@/lib/mock-api"
import { FileX, CheckCircle2 } from "lucide-react"
import { ImageViewer } from "./image-viewer"

interface PageGridProps {
  pages: Page[]
  documents: Document[]
  updatePages: (pages: Page[]) => void
  updateDocuments: (documents: Document[]) => void
  addActivityLog: (entry: { type: string; message: string }) => void
  updateCurrentStep: (
    step: "upload" | "splitting" | "blank_detection" | "segmentation" | "classification" | "extraction" | "complete",
  ) => void
  updateProcessing: (processing: boolean) => void
  isProcessing: boolean
  processedPages: number
  setProcessedPages: (count: number) => void
  setSegmentationStatus: (status: SegmentationStatus) => void
  onProcessingComplete?: (documents: Document[], totalPages: number) => void
}

const documentColors = [
  "border-blue-500 bg-blue-50 dark:bg-blue-950/20",
  "border-green-500 bg-green-50 dark:bg-green-950/20",
  "border-purple-500 bg-purple-50 dark:bg-purple-950/20",
  "border-orange-500 bg-orange-50 dark:bg-orange-950/20",
  "border-pink-500 bg-pink-50 dark:bg-pink-950/20",
]

export function PageGrid({
  pages,
  documents,
  updatePages,
  updateDocuments,
  addActivityLog,
  updateCurrentStep,
  updateProcessing,
  isProcessing,
  processedPages,
  setProcessedPages,
  setSegmentationStatus,
  onProcessingComplete,
}: PageGridProps) {
  const processingStarted = useRef(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)
  const processedPageIds = useRef<Set<string>>(new Set())
  const markdownResults = useRef<Map<number, { markdown: string; isBlank: boolean }>>(new Map())

  const [segmentationProgress, setSegmentationProgress] = useState<SegmentationProgress | null>(null)

  useEffect(() => {
    const needsProcessing = pages.some((page) => !processedPageIds.current.has(page.id))

    if (!isProcessing || processingStarted.current || pages.length === 0 || !needsProcessing) {
      return
    }

    const processInParallel = async () => {
      try {
        console.log("[v0] Starting parallel parse + blank detection for", pages.length, "pages")
        processingStarted.current = true

        updateCurrentStep("blank_detection")
        addActivityLog({
          type: "parse_started",
          message: `Procesando ${pages.length} páginas en paralelo...`,
        })

        const pagesToProcess = pages.filter((page) => !processedPageIds.current.has(page.id))

        console.log("[v0] Pages to process:", pagesToProcess.length, "out of", pages.length)

        const parallelPromises = pagesToProcess.map(async (page) => {
          const index = pages.findIndex((p) => p.id === page.id)

          if (processedPageIds.current.has(page.id)) {
            console.log("[v0] Page", index + 1, "already processed, skipping")
            return null
          }

          try {
            console.log("[v0] Processing page", index + 1)
            const response = await fetch("/api/parse-and-check-blank", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageUrl: page.imageUrl }),
            })

            const data = await response.json()

            console.log("[v0] Page", index + 1, "parse response:", {
              status: response.status,
              success: data.success,
              markdownLength: data.markdown?.length || 0,
              isBlank: data.isBlank,
              error: data.error || "none",
            })

            if (data.success) {
              processedPageIds.current.add(page.id)

              markdownResults.current.set(index, {
                markdown: data.markdown,
                isBlank: data.isBlank,
              })

              console.log("[v0] Page", index + 1, "processed:", data.isBlank ? "BLANK" : "CONTENT")

              updatePages((prevPages) => {
                const newPages = [...prevPages]
                newPages[index] = {
                  ...newPages[index],
                  isBlank: data.isBlank,
                  status: data.isBlank ? "blank" : "included",
                }
                return newPages
              })

              setProcessedPages(processedPageIds.current.size)

              if (data.isBlank) {
                addActivityLog({
                  type: "page_discarded",
                  message: `Página ${index + 1} descartada (página en blanco)`,
                })
              } else {
                addActivityLog({
                  type: "info",
                  message: `Página ${index + 1} analizada correctamente`,
                })
              }

              return {
                index,
                isBlank: data.isBlank,
                markdown: data.markdown,
              }
            }

            console.warn("[v0] Page", index + 1, "parse FAILED (success=false), skipping. Error:", data.error)
            return null
          } catch (error) {
            console.error("[v0] Error processing page", index + 1, error)
            processedPageIds.current.add(page.id)
            markdownResults.current.set(index, {
              markdown: "",
              isBlank: false,
            })

            setProcessedPages(processedPageIds.current.size)

            return null
          }
        })

        const results = await Promise.all(parallelPromises)

        console.log("[v0] All pages processed")

        const nonBlankIndices: number[] = []
        const nonBlankMarkdowns: string[] = []

        pages.forEach((page, index) => {
          const result = markdownResults.current.get(index)
          if (result && !result.isBlank) {
            nonBlankIndices.push(index)
            nonBlankMarkdowns.push(result.markdown)
          }
        })

        console.log("[v0] Non-blank pages:", nonBlankIndices.length)

        if (nonBlankIndices.length === 0) {
          console.log("[v0] No non-blank pages to segment")
          updateCurrentStep("complete")
          updateProcessing(false)
          return
        }

        updateCurrentStep("segmentation")
        addActivityLog({
          type: "segmentation_started",
          message: `Analizando segmentación de ${nonBlankIndices.length} páginas...`,
        })

        setSegmentationStatus({
          isSegmenting: true,
          documentsGenerated: 0,
        })

        setSegmentationProgress({
          phase: "segmentation",
          status: "running",
          pagesTotal: nonBlankIndices.length,
          pagesDone: 0,
          currentPage: nonBlankIndices[0],
          segmentStarts: [],
        })

        console.log("[v0] Calling batch segmentation API...")
        const segmentResponse = await fetch("/api/segment-documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdowns: nonBlankMarkdowns }),
        })

        if (!segmentResponse.ok) {
          setSegmentationProgress((prev) => (prev ? { ...prev, status: "error" } : null))
          throw new Error("Batch segmentation failed")
        }

        const segmentData = await segmentResponse.json()
        const segments = segmentData.segments || []

        console.log("[v0] Segmentation complete. Found", segments.length, "documents")

        const segmentStartPages: number[] = []
        for (const segment of segments) {
          const startPageInNonBlank = segment.start_page - 1
          const actualPageIndex = nonBlankIndices[startPageInNonBlank]
          segmentStartPages.push(actualPageIndex)
        }

        setSegmentationProgress({
          phase: "segmentation",
          status: "done",
          pagesTotal: nonBlankIndices.length,
          pagesDone: nonBlankIndices.length,
          currentPage: nonBlankIndices[nonBlankIndices.length - 1],
          segmentStarts: segmentStartPages,
        })

        setSegmentationStatus({
          isSegmenting: false,
          documentsGenerated: segments.length,
          processingDocuments: true,
        })

        const newDocuments: Document[] = segments.map((segment, docIdx) => ({
          id: `doc-${docIdx}`,
          pageIds: [],
          status: "creating",
        }))

        updatePages((currentPages) => {
          const updatedPages = [...currentPages]

          for (let docIdx = 0; docIdx < segments.length; docIdx++) {
            const segment = segments[docIdx]
            const startPageInNonBlank = segment.start_page - 1
            const endPageInNonBlank = segment.end_page - 1

            const docPageIndices = nonBlankIndices.slice(startPageInNonBlank, endPageInNonBlank + 1)
            const docPages: Page[] = []

            for (const pageIdx of docPageIndices) {
              updatedPages[pageIdx] = {
                ...updatedPages[pageIdx],
                documentId: `doc-${docIdx}`,
              }
              docPages.push(updatedPages[pageIdx])
            }

            newDocuments[docIdx].pageIds = docPages.map((p) => p.id)

            const startPage = docPages[0].index + 1
            const endPage = docPages[docPages.length - 1].index + 1
            addActivityLog({
              type: "document_created",
              message:
                docPages.length === 1
                  ? `Documento ${docIdx + 1} creado con la página ${startPage}`
                  : `Documento ${docIdx + 1} creado con las páginas ${startPage}-${endPage}`,
            })
          }

          return updatedPages
        })

        updateDocuments(newDocuments)

        console.log("[v0] Starting classification and extraction for all documents")
        updateCurrentStep("classification")

        // Process all documents in parallel
        const processingPromises = newDocuments.map((doc, docIdx) => {
          const segment = segments[docIdx]
          const startPageInNonBlank = segment.start_page - 1
          const endPageInNonBlank = segment.end_page - 1
          const docPageIndices = nonBlankIndices.slice(startPageInNonBlank, endPageInNonBlank + 1)

          // Get the pages for this document
          const docPages = docPageIndices.map((idx) => pages[idx]).filter(Boolean)

          return processDocument(doc, docPages, newDocuments, updateDocuments, addActivityLog, markdownResults.current)
        })

        // Wait for all documents to be processed
        await Promise.all(processingPromises)

        console.log("[v0] All documents processed")
        setSegmentationStatus({
          isSegmenting: false,
          documentsGenerated: segments.length,
          processingDocuments: false,
        })
        updateCurrentStep("complete")
        updateProcessing(false)
        
        // Notify parent that processing is complete for saving to history
        if (onProcessingComplete) {
          onProcessingComplete(newDocuments, pages.length)
        }
      } catch (error) {
        console.error("[v0] Error in processing:", error)
        setSegmentationProgress((prev) => (prev ? { ...prev, status: "error" } : null))
        setSegmentationStatus({
          isSegmenting: false,
          documentsGenerated: 0,
        })
        updateProcessing(false)
      }
    }

    processInParallel()
  }, [pages, isProcessing])

  const processDocument = async (
    doc: Document,
    docPages: Page[],
    allDocs: Document[],
    updateDocs: (docs: Document[]) => void,
    log: (entry: { type: string; message: string }) => void,
    markdownsMap: Map<number, { markdown: string; isBlank: boolean }>,
  ) => {
    if (!doc || !doc.id) {
      console.error("[v0] Invalid document passed to processDocument:", doc)
      return
    }

    const docIndex = allDocs.findIndex((d) => d.id === doc.id)
    if (docIndex === -1) {
      console.error("[v0] Document not found in allDocs array:", doc.id)
      return
    }

    const imageUrls = docPages.map((p) => p.imageUrl)

    const markdowns: string[] = []
    for (const page of docPages) {
      const pageIndex = pages.findIndex((p) => p.id === page.id)
      const result = markdownsMap.get(pageIndex)
      if (result) {
        markdowns.push(result.markdown)
      }
    }

    let combinedMarkdown = ""
    for (let i = 0; i < markdowns.length; i++) {
      combinedMarkdown += `# Página ${i + 1}\n\n${markdowns[i]}\n\n---\n\n`
    }

    sessionStorage.setItem(`doc-${doc.id}-markdown`, combinedMarkdown)

    allDocs[docIndex] = { ...allDocs[docIndex], status: "classifying" }
    updateDocs([...allDocs])
    updateCurrentStep("classification")

    await new Promise((resolve) => setTimeout(resolve, 300))

    let documentType = { type: "undefined" }

    try {
      const classificationPromise = fetch("/api/classify-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls, markdown: combinedMarkdown }),
      })

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Classification timeout after 120s")), 120000),
      )

      const classificationResponse = (await Promise.race([classificationPromise, timeoutPromise])) as Response

      if (!classificationResponse.ok) {
        throw new Error(`Classification failed with status ${classificationResponse.status}`)
      }

      const classificationData = await classificationResponse.json()
      documentType = { type: classificationData.type || "undefined" }

      allDocs[docIndex] = {
        ...allDocs[docIndex],
        documentType: documentType,
      }
      updateDocs([...allDocs])

      log({
        type: "document_classified",
        message: `Documento ${docIndex + 1} clasificado como ${documentType.type}`,
      })
    } catch (error) {
      console.error("[v0] Classification error for document", docIndex + 1, error)

      allDocs[docIndex] = {
        ...allDocs[docIndex],
        documentType: documentType,
      }
      updateDocs([...allDocs])

      log({
        type: "document_classified",
        message: `Documento ${docIndex + 1} clasificado como ${documentType.type} (error en clasificación)`,
      })
    }

    await new Promise((resolve) => setTimeout(resolve, 400))

    const fields = await mockGetRelevantFields(documentType.type, combinedMarkdown)
    allDocs[docIndex] = {
      ...allDocs[docIndex],
      fields,
      status: "extracting",
      extractedData: {},
    }
    updateDocs([...allDocs])
    updateCurrentStep("extraction")

    log({
      type: "fields_detected",
      message: `Campos detectados para ${documentType.type}: ${fields.map((f) => f.name).join(", ")}`,
    })

    const fieldNames = fields.map((f) => f.name)

    try {
      console.log("[v0] Extracting all fields at once for document", docIndex + 1)

      const response = await fetch("/api/extract-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: combinedMarkdown,
          fields: fieldNames,
          documentType: documentType.type,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const extractedData = data.extractedData || {}

        allDocs[docIndex] = {
          ...allDocs[docIndex],
          extractedData,
        }
        updateDocs([...allDocs])

        for (const fieldName of fieldNames) {
          const fieldData = extractedData[fieldName]
          if (fieldData) {
            log({
              type: "field_extracted",
              message: `Campo '${fieldName}' extraído: ${fieldData.value}`,
            })
          }
        }
      } else {
        console.error("[v0] Error extracting fields for document", docIndex + 1)
        const extractedData: Record<string, ExtractedField> = {}
        for (const fieldName of fieldNames) {
          extractedData[fieldName] = { value: "N/A", confidence: 1 }
        }
        allDocs[docIndex] = {
          ...allDocs[docIndex],
          extractedData,
        }
        updateDocs([...allDocs])
      }
    } catch (error) {
      console.error("[v0] Error extracting fields for document", docIndex + 1, error)
      const extractedData: Record<string, ExtractedField> = {}
      for (const fieldName of fieldNames) {
        extractedData[fieldName] = { value: "N/A", confidence: 1 }
      }
      allDocs[docIndex] = {
        ...allDocs[docIndex],
        extractedData,
      }
      updateDocs([...allDocs])
    }

    allDocs[docIndex] = {
      ...allDocs[docIndex],
      status: "complete",
    }
    updateDocs([...allDocs])

    console.log("[v0] Document", docIndex + 1, "fully processed")
  }

  const getPageDocumentColor = (page: Page) => {
    if (!page.documentId || !documents || documents.length === 0) return ""
    const docIndex = documents.findIndex((d) => d.id === page.documentId)
    return docIndex >= 0 ? documentColors[docIndex % documentColors.length] : ""
  }

  const handlePageClick = (index: number) => {
    setViewerIndex(index)
    setViewerOpen(true)
  }

  return (
    <>
      <Card className="shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {pages.map((page, index) => {
              const isProcessed = index < processedPages
              const isBeingSegmented = segmentationProgress?.status === "running" && !page.isBlank && isProcessed
              const isSegmentStart = segmentationProgress?.segmentStarts.includes(index)
              const segmentNumber = isSegmentStart ? segmentationProgress.segmentStarts.indexOf(index) + 1 : null

              return (
                <div
                  key={page.id}
                  className={`group relative overflow-hidden rounded-lg border-2 transition-all cursor-pointer hover:scale-105 hover:shadow-md ${
                    page.isBlank
                      ? "border-muted bg-muted/50 opacity-50"
                      : page.documentId
                        ? getPageDocumentColor(page)
                        : isBeingSegmented
                          ? "border-primary shadow-lg shadow-primary/30 ring-2 ring-primary/50"
                          : "border-border bg-card shadow-sm"
                  }`}
                  onClick={() => handlePageClick(index)}
                >
                  <div className="aspect-[2/3] overflow-hidden relative">
                    <img
                      src={page.imageUrl || "/placeholder.svg"}
                      alt={`Página ${page.index + 1}`}
                      className={`h-full w-full object-cover transition-all ${
                        !isProcessed ? "brightness-[0.3] grayscale" : ""
                      }`}
                    />

                    {isBeingSegmented && (
                      <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan" />
                      </div>
                    )}

                    {page.isBlank && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                        <span className="text-[0.5rem] xs:text-xs sm:text-sm font-bold text-gray-400/70 rotate-[-30deg] select-none whitespace-nowrap">
                          BLANCA
                        </span>
                      </div>
                    )}

                    {isBeingSegmented && (
                      <div className="absolute top-1 left-1 bg-primary/90 backdrop-blur-sm text-primary-foreground px-1.5 py-0.5 rounded text-[0.5rem] xs:text-[0.6rem] font-semibold shadow-sm">
                        Analizando
                      </div>
                    )}

                    {isSegmentStart && segmentNumber && (
                      <div className="absolute top-1 right-1 bg-green-500 text-white text-[8px] font-bold py-0.5 px-1 rounded shadow-sm">
                        Subdoc #{segmentNumber}
                      </div>
                    )}
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-white">{page.index + 1}</span>
                      {page.isBlank && <FileX className="h-3 w-3 text-orange-400" />}
                      {!page.isBlank && page.documentId && <CheckCircle2 className="h-3 w-3 text-green-400" />}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {viewerOpen && (
        <ImageViewer
          images={pages.map((p) => p.imageUrl)}
          initialIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
          pageLabels={pages.map((p) => `Página ${p.index + 1}`)}
        />
      )}
    </>
  )
}
