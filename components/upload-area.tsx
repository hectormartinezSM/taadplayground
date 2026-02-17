"use client"
import type { UploadAreaProps } from "./upload-area.types"
import { useCallback, useRef, useState } from "react"
import { Landmark, Loader2, CheckCircle2, Gavel, CreditCard, Lock, Upload } from "lucide-react"
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
    <div className="w-full max-w-4xl mx-auto space-y-8">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={handleFileSelect}
        aria-label="Seleccionar archivo"
      />

      {/* Header section */}
      <Card className="shadow-sm">
        <CardContent className="p-10">
          <div className="flex flex-col items-center justify-center gap-6 text-center">
            {/* Icon */}
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1E3A6E]/10 shadow-sm">
              {isLoading ? (
                <Loader2 className="h-10 w-10 animate-spin text-[#1E3A6E]" />
              ) : (
                <Landmark className="h-10 w-10 text-[#1E3A6E]" />
              )}
            </div>

            {/* Title */}
            <div className="space-y-3">
              <h2 className="text-3xl font-bold text-foreground text-balance">
                {isLoading ? "Procesando documento..." : "Clasificacion y extraccion documental"}
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-lg mx-auto">
                {isLoading
                  ? "Analizando el documento cargado"
                  : "Arrastra documentos sobre el caso de uso para iniciar el procesamiento automatico."}
              </p>
            </div>

            {/* Feature checklist */}
            <div className="w-full max-w-md bg-muted/30 rounded-lg p-5 border border-border/50">
              <p className="text-sm font-medium text-foreground mb-3">Esta demo incluye:</p>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-[#F5A623] flex-shrink-0" />
                  <span>Segmentacion en documentos individuales</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-[#F5A623] flex-shrink-0" />
                  <span>Clasificacion inteligente de documentos</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-[#F5A623] flex-shrink-0" />
                  <span>Extraccion de datos estructurados</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Two-card selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Legal Card - ACTIVE dropzone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Caso de uso Legal. Arrastra documentos o haz clic para seleccionar archivos."
          className={`group relative rounded-xl border-2 border-dashed p-8 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2 ${
            isDraggingLegal
              ? "border-[#F5A623] bg-[#F5A623]/10 shadow-lg scale-[1.02]"
              : "border-border/60 bg-card hover:border-[#F5A623]/50 hover:bg-[#F5A623]/5 hover:shadow-md"
          } ${isLoading ? "pointer-events-none opacity-60" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleLegalClick}
          onKeyDown={handleKeyDown}
        >
          <div className="flex flex-col items-center gap-5 text-center">
            {/* Icon */}
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

            {/* Title */}
            <h3 className="text-xl font-bold text-foreground">Legal</h3>

            {/* Description */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Documentos admitidos:</p>
              <p className="text-sm text-muted-foreground/80 leading-relaxed">
                Escrito al juzgado, Diligencia de ordenacion y Nota simple
              </p>
            </div>

            {/* Drop hint */}
            <div
              className={`flex items-center gap-2 text-xs font-medium transition-colors duration-200 ${
                isDraggingLegal ? "text-[#F5A623]" : "text-muted-foreground/60 group-hover:text-[#F5A623]/70"
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
          className="relative rounded-xl border-2 border-dashed border-border/30 bg-muted/20 p-8 opacity-60 cursor-not-allowed select-none"
        >
          <div className="flex flex-col items-center gap-5 text-center">
            {/* Proximamente pill */}
            <div className="absolute top-4 right-4">
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <Lock className="h-3 w-3" />
                Proximamente
              </span>
            </div>

            {/* Icon */}
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
              <CreditCard className="h-7 w-7 text-muted-foreground/50" />
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-muted-foreground/70">Pagos</h3>

            {/* Description */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground/60">Documentos admitidos:</p>
              <p className="text-sm text-muted-foreground/50 leading-relaxed">
                Facturas proveedores e Impuestos
              </p>
            </div>

            {/* Disabled hint */}
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground/40">
              <Upload className="h-3.5 w-3.5" />
              <span>No disponible</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="text-center">
          <p className="inline-block text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-md">
            {error}
          </p>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <div className="h-2 w-2 bg-[#F5A623] rounded-full animate-pulse" />
          <span className="text-sm">Preparando el analisis del documento...</span>
        </div>
      )}
    </div>
  )
}
