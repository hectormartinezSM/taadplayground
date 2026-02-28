"use client"

import type React from "react"
import { useCallback, useState, useRef } from "react"
import { Upload, Loader2, FileText, Wallet, Scale, Building2, Plane, Home } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Page, ActivityLogEntry, WorkflowStep } from "@/lib/types"
import { extractPagesFromPDF } from "@/lib/pdf-utils"
import { useLocale } from "@/lib/locale-context"

interface UploadAreaProps {
  onFileUpload: (pages: Page[]) => void
  updateWorkflowStep: (step: WorkflowStep) => void
  addActivityLog: (entry: Omit<ActivityLogEntry, "id" | "timestamp">) => void
}

const EXAMPLE_DOCUMENTS_ES = [
  {
    id: "expediente-activo",
    name: "Expediente activo",
    description: "Justificante solicitud préstamo hipotecario",
    type: "Documento Bancario",
  },
  {
    id: "testamentaria",
    name: "Testamentaría",
    description: "Documentación sobre procesos hereditarios",
    type: "Documento Notarial",
  },
  {
    id: "pasaporte",
    name: "Pasaporte",
    description: "Documento identificativo internacional",
    type: "Documento de Identidad",
  },
  {
    id: "nominas",
    name: "Nóminas",
    description: "Recibos de salario",
    type: "Documento Laboral",
  },
  {
    id: "factura",
    name: "Factura",
    description: "Factura con desglose completo",
    type: "Documento Fiscal",
  },
  {
    id: "contrato-alquiler",
    name: "Contrato de alquiler",
    description: "Contrato de arrendamiento de vivienda",
    type: "Documento Legal",
  },
]

const EXAMPLE_DOCUMENTS_EN = [
  {
    id: "expediente-activo",
    name: "Active File",
    description: "Mortgage loan application document",
    type: "Banking Document",
  },
  {
    id: "testamentaria",
    name: "Testamentary",
    description: "Documentation on inheritance processes",
    type: "Notarial Document",
  },
  {
    id: "pasaporte",
    name: "Passport",
    description: "International identification document",
    type: "Identity Document",
  },
  {
    id: "nominas",
    name: "Payslips",
    description: "Salary receipts",
    type: "Employment Document",
  },
  {
    id: "factura",
    name: "Invoice",
    description: "Invoice with full breakdown",
    type: "Fiscal Document",
  },
  {
    id: "contrato-alquiler",
    name: "Rental Agreement",
    description: "Residential lease contract",
    type: "Legal Document",
  },
]

const EXAMPLE_DOCUMENT_META: Array<{
  id: string
  url: string
  icon: typeof FileText
  iconColor: string
  bgColor: string
}> = [
  {
    id: "expediente-activo",
    url: "/examples/expediente_activo.pdf",
    icon: Building2,
    iconColor: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    id: "testamentaria",
    url: "/examples/testamentaria.pdf",
    icon: Scale,
    iconColor: "text-purple-600",
    bgColor: "bg-purple-50",
  },
  {
    id: "pasaporte",
    url: "/examples/pasaporte.pdf",
    icon: Plane,
    iconColor: "text-emerald-600",
    bgColor: "bg-emerald-50",
  },
  {
    id: "nominas",
    url: "/examples/nominas.pdf",
    icon: Wallet,
    iconColor: "text-amber-600",
    bgColor: "bg-amber-50",
  },
  {
    id: "factura",
    url: "/examples/factura.pdf",
    icon: FileText,
    iconColor: "text-rose-600",
    bgColor: "bg-rose-50",
  },
  {
    id: "contrato-alquiler",
    url: "/examples/contrato_alquiler.pdf",
    icon: Home,
    iconColor: "text-cyan-600",
    bgColor: "bg-cyan-50",
  },
]

export function UploadArea({ onFileUpload, updateWorkflowStep, addActivityLog }: UploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { locale, t } = useLocale()

  const exampleDocs = locale === "en" ? EXAMPLE_DOCUMENTS_EN : EXAMPLE_DOCUMENTS_ES

  const handleFiles = useCallback(
    async (files: File[]) => {
      setIsLoading(true)
      setError(null)
      updateWorkflowStep("splitting")

      try {
        let allPageImages: string[] = []

        for (const file of files) {
          if (file.type === "application/pdf") {
            const pdfPages = await extractPagesFromPDF(file)
            allPageImages = [...allPageImages, ...pdfPages]
          } else if (file.type.startsWith("image/")) {
            const reader = new FileReader()
            const imageUrl = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string)
              reader.onerror = reject
              reader.readAsDataURL(file)
            })
            allPageImages.push(imageUrl)
          } else {
            console.warn(`Skipping unsupported file: ${file.name}`)
          }
        }

        if (allPageImages.length === 0) {
          throw new Error(t("Tipo de archivo no soportado", "Unsupported file type"))
        }

        const pages: Page[] = allPageImages.map((imageUrl, index) => ({
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
        setError(err instanceof Error ? err.message : t("Error al procesar el archivo", "Error processing file"))
        setIsLoading(false)
        updateWorkflowStep("upload")
      }
    },
    [onFileUpload, updateWorkflowStep, t],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        (file) => file.type === "application/pdf" || file.type.startsWith("image/"),
      )
      if (droppedFiles.length > 0) {
        handleFiles(droppedFiles)
      }
    },
    [handleFiles],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        handleFiles(Array.from(files))
      }
    },
    [handleFiles],
  )

  const handleExampleDocument = useCallback(
    async (exampleId: string) => {
      const docInfo = exampleDocs.find((doc) => doc.id === exampleId)
      const meta = EXAMPLE_DOCUMENT_META.find((m) => m.id === exampleId)
      if (!docInfo || !meta) return

      setIsLoading(true)
      setError(null)
      updateWorkflowStep("splitting")

      addActivityLog({
        type: "info",
        message: t(
          `Cargando documento de ejemplo: ${docInfo.name}`,
          `Loading example document: ${docInfo.name}`,
        ),
        details: docInfo.description,
      })

      try {
        const response = await fetch(meta.url)
        if (!response.ok) {
          throw new Error(
            t(
              `No se pudo cargar el documento: ${response.status} ${response.statusText}`,
              `Could not load document: ${response.status} ${response.statusText}`,
            ),
          )
        }

        const blob = await response.blob()
        const pdfBlob = new Blob([blob], { type: "application/pdf" })
        const file = new File([pdfBlob], `${exampleId}.pdf`, { type: "application/pdf" })

        await handleFiles([file])

        addActivityLog({
          type: "success",
          message: t(
            `Documento de ejemplo cargado: ${docInfo.name}`,
            `Example document loaded: ${docInfo.name}`,
          ),
          details: `${docInfo.type} - ${docInfo.description}`,
        })
      } catch (err) {
        setError(
          t(
            "Error al cargar el documento de ejemplo. Verifica que el archivo exista.",
            "Error loading example document. Please verify the file exists.",
          ),
        )
        setIsLoading(false)
        updateWorkflowStep("upload")

        addActivityLog({
          type: "error",
          message: t("Error al cargar documento de ejemplo", "Error loading example document"),
          details: err instanceof Error ? err.message : t("Error desconocido", "Unknown error"),
        })
      }
    },
    [exampleDocs, updateWorkflowStep, addActivityLog, handleFiles, t],
  )

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      {/* File Upload Area */}
      <Card className="hover:shadow-lg transition-shadow">
        <CardContent className="p-8">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-6 rounded-xl border-2 border-dashed p-16 transition-all ${
              isDragging ? "border-primary bg-primary/5 shadow-inner" : "border-border bg-muted/30"
            }`}
          >
            <div className="rounded-full bg-muted p-4">
              {isLoading ? (
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              ) : (
                <Upload className="h-10 w-10 text-muted-foreground" />
              )}
            </div>

            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">
                {isLoading
                  ? t("Procesando documento...", "Processing document...")
                  : t("Cargar documento", "Upload document")}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {isLoading
                  ? t("Extrayendo páginas del documento", "Extracting pages from document")
                  : t(
                      "Arrastra un archivo PDF o imagen aquí, o haz clic para seleccionar",
                      "Drag a PDF or image file here, or click to select",
                    )}
              </p>
            </div>

            {error && <p className="text-sm text-red-600">Error: {error}</p>}

            {!isLoading && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileInput}
                  accept=".pdf,image/*"
                  multiple
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2"
                >
                  {t("Seleccionar archivo", "Select file")}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Example Documents Gallery */}
      <Card className="hover:shadow-lg transition-shadow">
        <CardContent className="p-12">
          <div className="text-center mb-8">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {t("Galerías de documentos", "Document Gallery")}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("Prueba la demo con alguno de los ejemplos", "Try the demo with one of the examples")}
            </p>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-base text-muted-foreground">
                {t("Procesando documento...", "Processing document...")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 max-w-4xl mx-auto">
              {exampleDocs.map((doc) => {
                const meta = EXAMPLE_DOCUMENT_META.find((m) => m.id === doc.id)!
                const IconComponent = meta.icon
                return (
                  <Card
                    key={doc.id}
                    className="cursor-pointer transition-all hover:shadow-lg hover:border-primary group"
                    onClick={() => !isLoading && handleExampleDocument(doc.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div
                          className={`${meta.bgColor} rounded-xl p-3 flex-shrink-0 group-hover:scale-105 transition-transform duration-300`}
                        >
                          <IconComponent className={`h-8 w-8 ${meta.iconColor}`} strokeWidth={1.5} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors line-clamp-1 mb-1">
                            {doc.name}
                          </h4>
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {doc.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
