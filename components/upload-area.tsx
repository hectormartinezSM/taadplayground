"use client"
import type { UploadAreaProps } from "./upload-area.types" // Declare UploadAreaProps type
import { useCallback, useState } from "react"
import { Landmark, Loader2, CheckCircle2, FileText, Play } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Page } from "@/lib/types"
import { extractPagesFromPDF } from "@/lib/pdf-utils"

const DEMO_DOCUMENT_URL =
  "https://blobs.vusercontent.net/blob/DNI_merged%20%281%29%20%281%29-dL7aMnLiSYQLv2H8mzaMLniorBb8J2.pdf"
const DEMO_DOCUMENT_NAME = "Documentación de ejemplo"

export function UploadArea({ onFileUpload, updateWorkflowStep, addActivityLog }: UploadAreaProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStartDemo = useCallback(async () => {
    console.log("[v0] Starting demo with fixed document")
    setIsLoading(true)
    setError(null)
    updateWorkflowStep("splitting")

    addActivityLog({
      type: "info",
      message: "Iniciando demo...",
      details: "Cargando documento de ejemplo",
    })

    try {
      // Fetch the PDF from the fixed URL
      console.log("[v0] Fetching demo document from:", DEMO_DOCUMENT_URL)
      const response = await fetch(DEMO_DOCUMENT_URL)

      if (!response.ok) {
        throw new Error("No se pudo cargar el documento de demo")
      }

      const blob = await response.blob()
      const file = new File([blob], "documento-demo.pdf", { type: "application/pdf" })

      console.log("[v0] Demo document loaded, size:", file.size)

      addActivityLog({
        type: "success",
        message: "Documento cargado correctamente",
        details: "Extrayendo páginas del documento...",
      })

      // Extract pages from PDF
      console.log("[v0] Extracting pages from PDF...")
      const pageImages = await extractPagesFromPDF(file)
      console.log("[v0] Extracted", pageImages.length, "pages from PDF")

      const pages: Page[] = pageImages.map((imageUrl, index) => ({
        id: `page-${index}`,
        index,
        imageUrl,
        status: "processing",
        isBlank: false,
      }))

      console.log("[v0] Created", pages.length, "page objects")

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

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      <Card className="hover:shadow-lg transition-shadow">
        <CardContent className="p-12">
          <div className="flex flex-col items-center justify-center gap-8 text-center">
            {/* Icon */}
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#0154FA]/10 shadow-sm">
              {isLoading ? (
                <Loader2 className="h-12 w-12 animate-spin text-[#0154FA]" />
              ) : (
                <Landmark className="h-12 w-12 text-[#0154FA]" />
              )}
            </div>

            {/* Title and description */}
            <div className="space-y-4">
              <h2 className="text-3xl font-bold text-foreground whitespace-nowrap text-center">
                {isLoading ? "Iniciando demo..." : "Clasificación y extracción documental"}
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed text-center max-w-lg mx-auto">
                {isLoading
                  ? "Cargando y procesando el documento de ejemplo"
                  : "Experimenta el poder de SERIMAG para clasificar y extraer información de documentos automáticamente."}
              </p>
              {!isLoading && (
                <div className="flex items-center justify-center gap-2 text-base text-foreground/80 font-medium bg-[#4A9FFF]/15 rounded-lg px-5 py-4 border border-[#4A9FFF]/25">
                  <FileText className="h-6 w-6 text-[#0154FA] flex-shrink-0" />
                  <span className="text-muted-foreground whitespace-nowrap">Caso de uso:</span>
                  <span className="text-[#0154FA] font-semibold whitespace-nowrap">
                    Solicitud de préstamo hipotecario
                  </span>
                </div>
              )}
            </div>

            {/* Document info card */}
            <div className="w-full max-w-md bg-muted/30 rounded-lg p-6 border border-border/50">
              {/* Features list */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground mb-3">Esta demo incluye:</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-[#0154FA]" />
                  <span>Segmentación en documentos individuales</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-[#0154FA]" />
                  <span>Clasificación inteligente de documentos</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-[#0154FA]" />
                  <span>Extracción de datos estructurados</span>
                </div>
              </div>
            </div>

            {/* Error message */}
            {error && <p className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-md">Error: {error}</p>}

            {/* Start button */}
            {!isLoading && (
              <Button
                size="lg"
                className="shadow-md hover:shadow-lg text-lg px-8 py-6 h-auto bg-[#0154FA] hover:bg-[#0043CC] text-white"
                onClick={handleStartDemo}
              >
                <Play className="h-5 w-5 mr-2" />
                Iniciar
              </Button>
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
                <span className="text-sm">Preparando el análisis del documento...</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
