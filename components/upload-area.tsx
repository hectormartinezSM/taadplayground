"use client"
import type { UploadAreaProps } from "./upload-area.types"
import { useCallback, useRef, useState } from "react"
import { Landmark, Loader2, Gavel, CreditCard, Lock, Upload } from "lucide-react"
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(
    async (file: File) => {
      setIsLoading(true)
      setError(null)
      updateWorkflowStep("splitting")

      addActivityLog({
        type: "info",
        message: "Iniciando procesamiento...",
        details: `Cargando documento: ${file.name}`,
      })

      try {
        const pageImages = await extractPagesFromPDF(file)

        const pages: Page[] = pageImages.map((imageUrl, index) => ({
          id: `page-${index}`,
          index,
          imageUrl,
          status: "processing",
          isBlank: false,
        }))

        addActivityLog({
          type: "success",
          message: "Documento cargado correctamente",
          details: `Extraídas ${pages.length} páginas`,
        })

        await new Promise((resolve) => setTimeout(resolve, 500))

        updateWorkflowStep("blank_detection")
        onFileUpload(pages)
        setIsLoading(false)
      } catch (err) {
        console.error("[v0] Error processing file:", err)
        setError(err instanceof Error ? err.message : "Error al procesar el documento")
        setIsLoading(false)
        updateWorkflowStep("upload")

        addActivityLog({
          type: "error",
          message: "Error al procesar el documento",
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
      onFileUpload(pages)
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

      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return

      const file = files[0]
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("Formato no permitido. Acepta PDF e imágenes (PNG, JPG, WebP).")
        return
      }

      processFile(file)
    },
    [isLoading, processFile],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return

      const file = files[0]
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("Formato no permitido. Acepta PDF e imágenes (PNG, JPG, WebP).")
        return
      }

      processFile(file)
    },
    [processFile],
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

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={handleFileSelect}
        aria-label="Seleccionar archivo"
      />

      {/* Single main card */}
      <Card className="shadow-sm">
        <CardContent className="p-8 md:p-10 lg:p-12">
          <div className="flex flex-col items-center gap-8">
            {/* Icon + Title + Subtitle */}
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-18 w-18 items-center justify-center rounded-full bg-[#1E3A6E]/10 shadow-sm">
                {isLoading ? (
                  <Loader2 className="h-9 w-9 animate-spin text-[#1E3A6E]" />
                ) : (
                  <Landmark className="h-9 w-9 text-[#1E3A6E]" />
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
            <div className="w-full">
              <h3 className="text-base font-semibold text-foreground">Casos de uso</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Selecciona un caso de uso y arrastra documentos para empezar
              </p>
            </div>

            {/* Two dropzone cards */}
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Legal Card - ACTIVE dropzone */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Caso de uso Legal. Arrastra documentos o haz clic para seleccionar archivos."
                className={`group relative rounded-xl border-2 border-dashed min-h-[240px] p-7 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2 ${
                  isDraggingLegal
                    ? "border-[#F5A623] bg-[#F5A623]/8 shadow-lg ring-2 ring-[#F5A623]/25"
                    : "border-border/60 bg-background hover:border-[#F5A623]/40 hover:bg-[#F5A623]/[0.03] hover:shadow-sm"
                } ${isLoading ? "pointer-events-none opacity-60" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleLegalClick}
                onKeyDown={handleKeyDown}
              >
                <div className="flex flex-col items-center justify-center gap-4 text-center h-full">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-200 ${
                      isDraggingLegal ? "bg-[#F5A623]/20" : "bg-[#1E3A6E]/8 group-hover:bg-[#F5A623]/10"
                    }`}
                  >
                    {isLoading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-[#F5A623]" />
                    ) : (
                      <Gavel
                        className={`h-6 w-6 transition-colors duration-200 ${
                          isDraggingLegal ? "text-[#F5A623]" : "text-[#1E3A6E] group-hover:text-[#F5A623]"
                        }`}
                      />
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-foreground">Legal</h3>

                  {/* Document chips */}
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <span className="inline-flex rounded-full bg-[#1E3A6E]/6 px-2.5 py-0.5 text-xs font-medium text-[#1E3A6E]">Escrito al juzgado</span>
                    <span className="inline-flex rounded-full bg-[#1E3A6E]/6 px-2.5 py-0.5 text-xs font-medium text-[#1E3A6E]">Diligencia de ordenacion</span>
                    <span className="inline-flex rounded-full bg-[#1E3A6E]/6 px-2.5 py-0.5 text-xs font-medium text-[#1E3A6E]">Nota simple</span>
                  </div>

                  <div
                    className={`flex items-center gap-2 text-xs font-medium transition-colors duration-200 mt-auto pt-2 ${
                      isDraggingLegal ? "text-[#F5A623]" : "text-muted-foreground/50 group-hover:text-[#F5A623]/80"
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>{isDraggingLegal ? "Suelta para iniciar" : "Arrastra archivos o haz clic"}</span>
                  </div>
                </div>
              </div>

              {/* Pagos Card - DISABLED */}
              <div
                aria-disabled="true"
                aria-label="Caso de uso Pagos. Proximamente."
                className="relative rounded-xl border-2 border-dashed border-border/40 bg-muted/10 min-h-[240px] p-7 cursor-not-allowed select-none pointer-events-none"
              >
                <div className="flex flex-col items-center justify-center gap-4 text-center h-full">
                  {/* Proximamente pill */}
                  <div className="absolute top-3.5 right-3.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground/70">
                      <Lock className="h-3 w-3" />
                      Proximamente
                    </span>
                  </div>

                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40">
                    <CreditCard className="h-6 w-6 text-muted-foreground/40" />
                  </div>

                  <h3 className="text-lg font-bold text-muted-foreground/50">Pagos</h3>

                  {/* Document chips - disabled style */}
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <span className="inline-flex rounded-full bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground/40">Facturas proveedores</span>
                    <span className="inline-flex rounded-full bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground/40">Impuestos</span>
                  </div>

                  <p className="text-xs text-muted-foreground/40 mt-auto pt-2">
                    Disponible en la siguiente fase
                  </p>
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
