"use client"

import { useCallback, useState } from "react"
import { Loader2, FileText, Receipt, ShieldAlert, FlaskConical } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
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
    id: "lab-report",
    name: "Informe de Laboratorio",
    description: "Informe de patologia con diagnostico del paciente",
    type: "Documento Medico",
  },
  {
    id: "accident-statement",
    name: "Declaracion de Accidente",
    description: "Declaracion amistosa de accidente de trafico",
    type: "Documento de Seguro",
  },
  {
    id: "insurance-invoice",
    name: "Factura de Seguro",
    description: "Factura de prima de seguro con desglose",
    type: "Documento de Seguro",
  },
  {
    id: "sales-receipt",
    name: "Ticket de Compra",
    description: "Ticket de venta con articulos y total",
    type: "Documento Comercial",
  },
]

const EXAMPLE_DOCUMENTS_EN = [
  {
    id: "lab-report",
    name: "Lab Report",
    description: "Pathology report with patient diagnosis",
    type: "Medical Document",
  },
  {
    id: "accident-statement",
    name: "Accident Statement",
    description: "Friendly accident declaration for traffic incident",
    type: "Insurance Document",
  },
  {
    id: "insurance-invoice",
    name: "Insurance Invoice",
    description: "Insurance premium invoice with breakdown",
    type: "Insurance Document",
  },
  {
    id: "sales-receipt",
    name: "Sales Receipt",
    description: "Sales receipt with items and total",
    type: "Commercial Document",
  },
]

const EXAMPLE_DOCUMENT_META: Array<{
  id: string
  url: string
  fileType: "pdf" | "image"
  icon: typeof FileText
  iconColor: string
  bgColor: string
}> = [
  {
    id: "lab-report",
    url: "/examples/lab_report.pdf",
    fileType: "pdf",
    icon: FlaskConical,
    iconColor: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    id: "accident-statement",
    url: "/examples/accident_statement.pdf",
    fileType: "pdf",
    icon: ShieldAlert,
    iconColor: "text-amber-600",
    bgColor: "bg-amber-50",
  },
  {
    id: "insurance-invoice",
    url: "/examples/insurance_invoice.jpg",
    fileType: "image",
    icon: FileText,
    iconColor: "text-emerald-600",
    bgColor: "bg-emerald-50",
  },
  {
    id: "sales-receipt",
    url: "/examples/sales_receipt.jpg",
    fileType: "image",
    icon: Receipt,
    iconColor: "text-rose-600",
    bgColor: "bg-rose-50",
  },
]

export function UploadArea({ onFileUpload, updateWorkflowStep, addActivityLog }: UploadAreaProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { locale, t } = useLocale()

  const exampleDocs = locale === "en" ? EXAMPLE_DOCUMENTS_EN : EXAMPLE_DOCUMENTS_ES

  const handleFile = useCallback(
    async (file: File) => {
      setIsLoading(true)
      setError(null)
      updateWorkflowStep("splitting")

      try {
        let pageImages: string[] = []

        if (file.type === "application/pdf") {
          pageImages = await extractPagesFromPDF(file)
        } else if (file.type.startsWith("image/")) {
          const reader = new FileReader()
          const imageUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
          pageImages = [imageUrl]
        } else {
          throw new Error(t("Tipo de archivo no soportado", "Unsupported file type"))
        }

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
        setError(err instanceof Error ? err.message : t("Error al procesar el archivo", "Error processing file"))
        setIsLoading(false)
        updateWorkflowStep("upload")
      }
    },
    [onFileUpload, updateWorkflowStep, t],
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

        if (meta.fileType === "image") {
          // For image-based documents, convert to a single-page image
          const mimeType = meta.url.endsWith(".png") ? "image/png" : "image/jpeg"
          const imageBlob = new Blob([blob], { type: mimeType })
          const file = new File([imageBlob], `${exampleId}.jpg`, { type: mimeType })
          await handleFile(file)
        } else {
          // For PDF documents
          const pdfBlob = new Blob([blob], { type: "application/pdf" })
          const file = new File([pdfBlob], `${exampleId}.pdf`, { type: "application/pdf" })
          await handleFile(file)
        }

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
    [exampleDocs, updateWorkflowStep, addActivityLog, handleFile, t],
  )

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      <Card className="hover:shadow-lg transition-shadow">
        <CardContent className="p-12">
          <div className="text-center mb-8">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {t("Galeria de documentos", "Document Gallery")}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("Prueba la demo con alguno de los ejemplos", "Try the demo with one of the examples")}
            </p>
          </div>

          {error && <p className="mb-6 text-sm text-center text-red-600">Error: {error}</p>}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-base text-muted-foreground">
                {t("Procesando documento...", "Processing document...")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 max-w-4xl mx-auto">
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
