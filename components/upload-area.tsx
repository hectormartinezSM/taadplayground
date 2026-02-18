"use client"
import type { UploadAreaProps } from "./upload-area.types"
import { useCallback, useRef, useState } from "react"
import { Briefcase, Loader2, Gavel, FileText, Upload } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { Page } from "@/lib/types"
import { extractPagesFromPDF } from "@/lib/pdf-utils"

const DEMO_DOCUMENT_URL =
  "https://blobs.vusercontent.net/blob/DNI_merged%20%281%29%20%281%29-dL7aMnLiSYQLv2H8mzaMLniorBb8J2.pdf"

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"]

export function UploadArea({ onFileUpload, updateWorkflowStep, addActivityLog }: UploadAreaProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDraggingLegal, setIsDraggingLegal] = useState(false)
  const [isDraggingPagos, setIsDraggingPagos] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputPagosRef = useRef<HTMLInputElement>(null)

  const processFiles = useCallback(
    async (files: File[], useCase: "legal" | "pagos" = "legal") => {
      setIsLoading(true)
      setError(null)
      updateWorkflowStep("splitting")

      const fileNames = files.map((f) => f.name).join(", ")
      addActivityLog({
        type: "info",
        message: files.length === 1 ? "Iniciando procesamiento..." : `Procesando ${files.length} documentos...`,
        details: `Cargando: ${fileNames}`,
      })

      try {
        const allPages: Page[] = []
        let globalIndex = 0

        for (const file of files) {
          const pageImages = await extractPagesFromPDF(file)

          for (const imageUrl of pageImages) {
            allPages.push({
              id: `page-${globalIndex}`,
              index: globalIndex,
              imageUrl,
              status: "processing",
              isBlank: false,
            })
            globalIndex++
          }
        }

        addActivityLog({
          type: "success",
          message: files.length === 1 ? "Documento cargado correctamente" : `${files.length} documentos cargados correctamente`,
          details: `Extraidas ${allPages.length} paginas en total`,
        })

        await new Promise((resolve) => setTimeout(resolve, 500))

        updateWorkflowStep("blank_detection")
        onFileUpload(allPages, useCase)
        setIsLoading(false)
      } catch (err) {
        console.error("[v0] Error processing files:", err)
        setError(err instanceof Error ? err.message : "Error al procesar los documentos")
        setIsLoading(false)
        updateWorkflowStep("upload")

        addActivityLog({
          type: "error",
          message: "Error al procesar los documentos",
          details: err instanceof Error ? err.message : "Error desconocido",
        })
      }
    },
    [onFileUpload, updateWorkflowStep, addActivityLog],
  )

  const handleStartDemo = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    updateWorkflowStep("splitting")

    addActivityLog({
      type: "info",
      message: "Iniciando demo...",
      details: "Cargando documento de ejemplo",
    })

    try {
      const response = await fetch(DEMO_DOCUMENT_URL)
      if (!response.ok) {
        throw new Error("No se pudo cargar el documento de demo")
      }

      const blob = await response.blob()
      const file = new File([blob], "documento-demo.pdf", { type: "application/pdf" })

      addActivityLog({
        type: "success",
        message: "Documento cargado correctamente",
        details: "Extrayendo páginas del documento...",
      })

      const pageImages = await extractPagesFromPDF(file)

      const pages: Page[] = pageImages.map((imageUrl, index) => ({
        id: `page-${index}`,
        index,
        imageUrl,
        status: "processing",
        isBlank: false,
      }))

      await new Promise((resolve) => setTimeout(resolve, 500))

      updateWorkflowStep("blank_detection")
      onFileUpload(pages, "legal")
      setIsLoading(false)
    } catch (err) {
      console.error("[v0] Error starting demo:", err)
      setError(err instanceof Error ? err.message : "Error al iniciar la demo")
      setIsLoading(false)
      updateWorkflowStep("upload")

      addActivityLog({
        type: "error",
        message: "Error al iniciar la demo",
        details: err instanceof Error ? err.message : "Error desconocido",
      })
    }
  }, [onFileUpload, updateWorkflowStep, addActivityLog])

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!isLoading) {
        setIsDraggingLegal(true)
      }
    },
    [isLoading],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingLegal(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDraggingLegal(false)

      if (isLoading) return

      const droppedFiles = Array.from(e.dataTransfer.files)
      if (droppedFiles.length === 0) return

      const validFiles = droppedFiles.filter((f) => ACCEPTED_TYPES.includes(f.type))
      if (validFiles.length === 0) {
        setError("Formato no permitido. Acepta PDF e imagenes (PNG, JPG, WebP).")
        return
      }
      if (validFiles.length < droppedFiles.length) {
        setError(`${droppedFiles.length - validFiles.length} archivo(s) ignorado(s) por formato no permitido.`)
      }

      processFiles(validFiles)
    },
    [isLoading, processFiles],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files
      if (!selectedFiles || selectedFiles.length === 0) return

      const validFiles = Array.from(selectedFiles).filter((f) => ACCEPTED_TYPES.includes(f.type))
      if (validFiles.length === 0) {
        setError("Formato no permitido. Acepta PDF e imagenes (PNG, JPG, WebP).")
        return
      }

      processFiles(validFiles)
      // Reset so the same files can be re-selected
      e.target.value = ""
    },
    [processFiles],
  )

  const handleLegalClick = useCallback(() => {
    if (isLoading) return
    fileInputRef.current?.click()
  }, [isLoading])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        handleLegalClick()
      }
    },
    [handleLegalClick],
  )

  // Pagos (Facturas) handlers
  const handleDragOverPagos = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!isLoading) {
        setIsDraggingPagos(true)
      }
    },
    [isLoading],
  )

  const handleDragLeavePagos = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingPagos(false)
  }, [])

  const handleDropPagos = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDraggingPagos(false)

      if (isLoading) return

      const droppedFiles = Array.from(e.dataTransfer.files)
      if (droppedFiles.length === 0) return

      const validFiles = droppedFiles.filter((f) => ACCEPTED_TYPES.includes(f.type))
      if (validFiles.length === 0) {
        setError("Formato no permitido. Acepta PDF e imagenes (PNG, JPG, WebP).")
        return
      }
      if (validFiles.length < droppedFiles.length) {
        setError(`${droppedFiles.length - validFiles.length} archivo(s) ignorado(s) por formato no permitido.`)
      }

      processFiles(validFiles, "pagos")
    },
    [isLoading, processFiles],
  )

  const handlePagosClick = useCallback(() => {
    if (isLoading) return
    fileInputPagosRef.current?.click()
  }, [isLoading])

  const handleFileSelectPagos = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files
      if (!selectedFiles || selectedFiles.length === 0) return

      const validFiles = Array.from(selectedFiles).filter((f) => ACCEPTED_TYPES.includes(f.type))
      if (validFiles.length === 0) {
        setError("Formato no permitido. Acepta PDF e imagenes (PNG, JPG, WebP).")
        return
      }

      processFiles(validFiles, "pagos")
      e.target.value = ""
    },
    [processFiles],
  )

  const handleKeyDownPagos = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        handlePagosClick()
      }
    },
    [handlePagosClick],
  )

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        aria-label="Seleccionar archivos Legal"
      />
      <input
        ref={fileInputPagosRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        multiple
        className="hidden"
        onChange={handleFileSelectPagos}
        aria-label="Seleccionar archivos Facturas"
      />

      {/* Single main card */}
      <Card className="shadow-sm">
        <CardContent className="p-8 md:p-10 lg:p-12">
          <div className="flex flex-col items-center gap-8">
            {/* Icon + Title + Subtitle */}
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-18 w-18 items-center justify-center rounded-full bg-[#F5A623]/10 shadow-sm">
                {isLoading ? (
                  <Loader2 className="h-9 w-9 animate-spin text-[#F5A623]" />
                ) : (
                  <Briefcase className="h-9 w-9 text-[#F5A623]" />
                )}
              </div>

              <div className="space-y-2.5">
                <h2 className="text-3xl font-bold text-foreground text-balance">
                  {isLoading ? "Procesando documento..." : "Clasificacion y extraccion documental"}
                </h2>
                <p className="text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                  {isLoading
                    ? "Analizando el documento cargado"
                    : "Arrastra documentos sobre el caso de uso para iniciar el procesamiento automatico."}
                </p>
              </div>
            </div>

            {/* Section header */}
            <div className="w-full mt-2">
              <div className="flex items-center gap-3 mb-3">
                <span className="inline-flex items-center rounded-md bg-[#1E3A6E]/8 px-3 py-1 text-sm font-semibold text-[#1E3A6E] ring-1 ring-[#1E3A6E]/15">
                  Casos de uso
                </span>
                <div className="flex-1 border-t border-border/30" />
              </div>
              <p className="text-xs text-muted-foreground/70 mb-5">
                Arrastra documentos sobre un caso para empezar
              </p>
            </div>

            {/* Two dropzone cards */}
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Legal Card - ACTIVE dropzone */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Caso de uso Legal. Arrastra documentos o haz clic para seleccionar archivos."
                className={`group relative rounded-xl border-2 border-dashed min-h-[220px] p-8 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2 ${
                  isDraggingLegal
                    ? "border-[#F5A623] bg-[#F5A623]/10 shadow-lg ring-2 ring-[#F5A623]/20 scale-[1.01]"
                    : "border-border/50 bg-[#F5A623]/[0.02] hover:border-[#F5A623]/50 hover:bg-[#F5A623]/5 hover:shadow-md hover:ring-2 hover:ring-[#F5A623]/10"
                } ${isLoading ? "pointer-events-none opacity-60" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleLegalClick}
                onKeyDown={handleKeyDown}
              >
                <div className="flex flex-col items-center justify-center gap-5 text-center h-full">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors duration-200 ${
                      isDraggingLegal ? "bg-[#F5A623]/20" : "bg-[#1E3A6E]/10 group-hover:bg-[#F5A623]/15"
                    }`}
                  >
                    {isLoading ? (
                      <Loader2 className="h-7 w-7 animate-spin text-[#F5A623]" />
                    ) : (
                      <Gavel
                        className={`h-7 w-7 transition-colors duration-200 ${
                          isDraggingLegal ? "text-[#F5A623]" : "text-[#1E3A6E] group-hover:text-[#F5A623]"
                        }`}
                      />
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-foreground">Legal</h3>

                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-muted-foreground">Documentos admitidos:</p>
                    <p className="text-sm text-muted-foreground/80 leading-relaxed">
                      Escrito al juzgado, Diligencia de ordenacion y Nota simple
                    </p>
                  </div>

                  <div
                    className={`flex items-center gap-2 text-xs font-medium transition-colors duration-200 mt-auto ${
                      isDraggingLegal ? "text-[#F5A623]" : "text-muted-foreground/60 group-hover:text-[#F5A623]/70"
                    }`}
                  >
                    <Upload className="h-4 w-4" />
                    <span>{isDraggingLegal ? "Suelta para iniciar" : "Arrastra archivos o haz clic"}</span>
                  </div>
                </div>
              </div>

              {/* Facturas Card - ACTIVE dropzone */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Caso de uso Facturas. Arrastra documentos o haz clic para seleccionar archivos."
                className={`group relative rounded-xl border-2 border-dashed min-h-[220px] p-8 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2 ${
                  isDraggingPagos
                    ? "border-[#F5A623] bg-[#F5A623]/10 shadow-lg ring-2 ring-[#F5A623]/20 scale-[1.01]"
                    : "border-border/50 bg-[#F5A623]/[0.02] hover:border-[#F5A623]/50 hover:bg-[#F5A623]/5 hover:shadow-md hover:ring-2 hover:ring-[#F5A623]/10"
                } ${isLoading ? "pointer-events-none opacity-60" : ""}`}
                onDragOver={handleDragOverPagos}
                onDragLeave={handleDragLeavePagos}
                onDrop={handleDropPagos}
                onClick={handlePagosClick}
                onKeyDown={handleKeyDownPagos}
              >
                <div className="flex flex-col items-center justify-center gap-5 text-center h-full">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors duration-200 ${
                      isDraggingPagos ? "bg-[#F5A623]/20" : "bg-[#1E3A6E]/10 group-hover:bg-[#F5A623]/15"
                    }`}
                  >
                    {isLoading ? (
                      <Loader2 className="h-7 w-7 animate-spin text-[#F5A623]" />
                    ) : (
                      <FileText
                        className={`h-7 w-7 transition-colors duration-200 ${
                          isDraggingPagos ? "text-[#F5A623]" : "text-[#1E3A6E] group-hover:text-[#F5A623]"
                        }`}
                      />
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-foreground">Facturas</h3>

                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-muted-foreground">Documentos admitidos:</p>
                    <p className="text-sm text-muted-foreground/80 leading-relaxed">
                      Factura ordinaria y Factura IBI
                    </p>
                  </div>

                  <div
                    className={`flex items-center gap-2 text-xs font-medium transition-colors duration-200 mt-auto ${
                      isDraggingPagos ? "text-[#F5A623]" : "text-muted-foreground/60 group-hover:text-[#F5A623]/70"
                    }`}
                  >
                    <Upload className="h-4 w-4" />
                    <span>{isDraggingPagos ? "Suelta para iniciar" : "Arrastra archivos o haz clic"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-md">
                {error}
              </p>
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-center justify-center gap-3 text-muted-foreground">
                <div className="h-2 w-2 bg-[#F5A623] rounded-full animate-pulse" />
                <span className="text-sm">Preparando el analisis del documento...</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
