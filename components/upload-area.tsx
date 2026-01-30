"use client"

import type React from "react"
import type { UploadAreaProps } from "./upload-area.types" // Declare UploadAreaProps type
import { useCallback, useState, useEffect } from "react"
import { Upload, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Page } from "@/lib/types"
import { extractPagesFromPDF, convertImageToDataURL } from "@/lib/pdf-utils"
import { apiRateLimiter } from "@/lib/rate-limiter"



export function UploadArea({ onFileUpload, updateWorkflowStep, addActivityLog }: UploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrSession, setQrSession] = useState<{ sessionId: string; mobileUploadUrl: string } | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)

  const handleFile = useCallback(
    async (file: File) => {
      console.log("[v0] Processing file:", file.name, "Type:", file.type)
      setIsLoading(true)
      setError(null)
      updateWorkflowStep("splitting")

      try {
        let pageImages: string[] = []

        if (file.type === "application/pdf") {
          console.log("[v0] Extracting pages from PDF...")
          pageImages = await extractPagesFromPDF(file)
          console.log("[v0] Extracted", pageImages.length, "pages from PDF")
        } else if (file.type.startsWith("image/")) {
          console.log("[v0] Converting image to data URL...")
          const imageUrl = await convertImageToDataURL(file)
          pageImages = [imageUrl]
          console.log("[v0] Image converted successfully")
        } else {
          throw new Error("Tipo de archivo no soportado")
        }

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
        console.error("[v0] Error processing file:", err)
        setError(err instanceof Error ? err.message : "Error al procesar el archivo")
        setIsLoading(false)
        updateWorkflowStep("upload")
      }
    },
    [onFileUpload, updateWorkflowStep],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const file = e.dataTransfer.files[0]
      if (file && (file.type === "application/pdf" || file.type.startsWith("image/"))) {
        handleFile(file)
      }
    },
    [handleFile],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        handleFile(file)
      }
    },
    [handleFile],
  )

  useEffect(() => {
    const createSession = async () => {
      console.log("[v0] Creating QR session...")
      try {
        const response = await fetch("/api/upload-session", {
          method: "POST",
        })

        if (!response.ok) {
          const text = await response.text()
          console.error("[v0] Session creation failed:", response.status, text)
          throw new Error(`Failed to create session: ${response.status}`)
        }

        const data = await response.json()
        console.log("[v0] Session created successfully:", data)

        // This ensures we use the correct URL that doesn't require authentication
        const mobileUploadUrl = `${data.baseUrl}/mobile-upload?sessionId=${data.sessionId}&token=${encodeURIComponent(data.token)}`

        setQrSession({
          sessionId: data.sessionId,
          mobileUploadUrl,
        })
        console.log("[v0] Created QR session:", data.sessionId)
        console.log("[v0] Mobile upload URL:", mobileUploadUrl)

        generateQRCode(mobileUploadUrl)

        startPolling(data.sessionId)
      } catch (error) {
        console.error("[v0] Error creating session:", error)
        addActivityLog({
          type: "error",
          message: "No se pudo generar el código QR",
          details: error instanceof Error ? error.message : "Error desconocido",
        })
      }
    }

    createSession()

    return () => {
      setIsPolling(false)
    }
  }, [])

  const startPolling = useCallback(
    (sessionId: string) => {
      console.log("[v0] Starting polling for session:", sessionId)
      setIsPolling(true)

      const pollInterval = setInterval(async () => {
        try {
          await apiRateLimiter.execute(async () => {
            console.log("[v0] Polling session status:", sessionId)
            const response = await fetch(`/api/upload-status?sessionId=${sessionId}`)
            const data = await response.json()

            console.log("[v0] Status response:", data.status, data.fileInfo ? "with fileInfo" : "no file yet")

            if (data.status === "ready") {
              console.log("[v0] Mobile upload detected:", data.fileInfo)
              clearInterval(pollInterval)
              setIsPolling(false)
              setShowQR(false)

              addActivityLog({
                type: "success",
                message: "📱 ¡Documento recibido desde móvil!",
                details: `Iniciando procesamiento de ${data.fileInfo.fileName}...`,
              })

              // Download the file and process it
              await handleMobileUpload(data.fileInfo)
            }
          })
        } catch (error) {
          console.error("[v0] Polling error:", error)
        }
      }, 2000)

      // Clean up polling after 1 hour
      setTimeout(
        () => {
          console.log("[v0] Polling timeout reached, stopping")
          clearInterval(pollInterval)
          setIsPolling(false)
        },
        60 * 60 * 1000,
      )
    },
    [addActivityLog],
  )

  const handleMobileUpload = useCallback(
    async (fileInfo: { blobUrl: string; fileName: string; fileType: string; fileSize: number }) => {
      try {
        console.log("[v0] Processing mobile upload:", fileInfo.fileName)
        console.log("[v0] Downloading from Blob URL:", fileInfo.blobUrl)

        addActivityLog({
          type: "info",
          message: "🔄 Descargando documento desde móvil...",
          details: `${fileInfo.fileName} (${(fileInfo.fileSize / 1024 / 1024).toFixed(2)} MB)`,
        })

        const response = await fetch(fileInfo.blobUrl)
        if (!response.ok) {
          throw new Error("Failed to download file from Blob storage")
        }

        const blob = await response.blob()
        const file = new File([blob], fileInfo.fileName, { type: fileInfo.fileType })

        console.log("[v0] File downloaded:", file.name, file.size, file.type)

        addActivityLog({
          type: "info",
          message: "📄 Procesando documento...",
          details: "Extrayendo páginas y analizando contenido",
        })

        // Process using existing handleFile logic
        await handleFile(file)

        addActivityLog({
          type: "success",
          message: "✅ Documento desde móvil procesado correctamente",
          details: fileInfo.fileName,
        })
      } catch (error) {
        console.error("[v0] Error processing mobile upload:", error)
        addActivityLog({
          type: "error",
          message: "❌ Error al procesar documento desde móvil",
          details: error instanceof Error ? error.message : "Error desconocido",
        })
      }
    },
    [addActivityLog, handleFile],
  )

  const generateQRCode = useCallback((url: string) => {
    try {
      const size = 256
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`
      setQrCodeDataUrl(qrApiUrl)
      console.log("[v0] Generated QR code URL:", qrApiUrl)
    } catch (error) {
      console.error("[v0] Error generating QR code:", error)
    }
  }, [])

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      <Card className="hover:shadow-lg transition-shadow">
        <CardContent className="p-12 relative">
          {showQR && (
            <div
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
              onClick={() => setShowQR(false)}
            >
              <div
                className="bg-card border rounded-lg shadow-xl p-6 animate-in fade-in slide-in-from-top-2 max-w-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-2 right-2 h-6 w-6 rounded-full bg-background shadow-md"
                  onClick={() => setShowQR(false)}
                >
                  <span className="text-xs">✕</span>
                </Button>
                <div className="text-center space-y-4">
                  <p className="text-base font-semibold text-foreground">Escanea con tu móvil</p>
                  {qrCodeDataUrl ? (
                    <div className="bg-white p-4 rounded-lg inline-block">
                      <img src={qrCodeDataUrl || "/placeholder.svg"} alt="QR Code" className="h-56 w-56" />
                    </div>
                  ) : (
                    <div className="h-64 w-64 bg-muted/30 rounded-md flex items-center justify-center mx-auto">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {isPolling && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2 justify-center">
                      <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></span>
                      <span>Esperando documento...</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

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
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 shadow-sm">
              {isLoading ? (
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              ) : (
                <Upload className="h-10 w-10 text-primary" />
              )}
            </div>

            <div className="text-center max-w-lg">
              <h3 className="mb-2 text-xl font-semibold text-foreground">
                {isLoading ? "Procesando documento..." : "Cargar documento"}
              </h3>
              <p className="mb-6 text-base text-muted-foreground leading-relaxed">
                {isLoading
                  ? "Extrayendo páginas del documento"
                  : "Arrastra un archivo PDF o imagen aquí, o haz clic para seleccionar"}
              </p>

              <p className="mb-6">
                <button
                  onClick={() => setShowQR(!showQR)}
                  className="text-sm text-primary underline hover:text-primary/80 transition-colors"
                >
                  Sube una foto directamente desde tu móvil
                </button>
              </p>

              {error && <p className="mb-4 text-sm text-red-600">Error: {error}</p>}

              {!isLoading && (
                <>
                  <label htmlFor="file-upload">
                    <Button asChild size="lg" className="shadow-md hover:shadow-lg">
                      <span>Seleccionar archivo</span>
                    </Button>
                  </label>
                  <input
                    id="file-upload"
                    type="file"
                    accept=".pdf,image/*"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </>
              )}
            </div>
          </div>


        </CardContent>
      </Card>
    </div>
  )
}
