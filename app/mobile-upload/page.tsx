"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, Check, AlertCircle, Loader2 } from "lucide-react"
import Image from "next/image"

export default function MobileUploadPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get("sessionId")
    const t = params.get("token")

    console.log("[v0] Mobile upload page loaded")
    console.log("[v0] Session:", id, "Token:", t ? "present" : "missing")

    fetch("/api/mobile-test-simple", { method: "POST" })
      .then((r) => r.json())
      .then((data) => console.log("[v0] Server reachable:", data))
      .catch((err) => console.error("[v0] Cannot reach server:", err))

    setSessionId(id)
    setIsLoading(false)
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      console.log("[v0] File selected:", file.name, file.size, "bytes")
      setSelectedFile(file)
      setUploadStatus("idle")
      setErrorMessage("")
    }
  }

  const handleUpload = async () => {
    if (!selectedFile || !sessionId) {
      console.log("[v0] Missing required data for upload")
      setErrorMessage("Información de sesión inválida")
      setUploadStatus("error")
      return
    }

    console.log("[v0] Starting upload...")
    console.log("[v0] SessionID:", sessionId)
    console.log("[v0] File:", selectedFile.name, selectedFile.type, selectedFile.size)
    // console.log("[v0] Token:", token?.substring(0, 20) + "...") // Removed token requirement

    setIsUploading(true)
    setUploadStatus("idle")
    setErrorMessage("")

    try {
      const formData = new FormData()
      formData.append("file", selectedFile)
      formData.append("sessionId", sessionId)
      // formData.append("token", token) // Don't send token from client

      console.log("[v0] FormData prepared, making fetch request...")
      console.log("[v0] URL:", window.location.origin + "/api/mobile-upload")

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 45000) // 45 second timeout

      const response = await fetch("/api/mobile-upload", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      console.log("[v0] Response status:", response.status)
      console.log("[v0] Response ok:", response.ok)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("[v0] Error response:", errorText)

        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { error: errorText }
        }

        throw new Error(errorData.error || errorData.details || "Error al subir el archivo")
      }

      const result = await response.json()
      console.log("[v0] Upload successful:", result)

      setUploadStatus("success")
      setSelectedFile(null)
      setErrorMessage("")
    } catch (error) {
      console.error("[v0] Upload failed:", error)

      let errorMsg = "Error desconocido"
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          errorMsg = "Tiempo de espera agotado (45s)"
        } else {
          errorMsg = error.message
        }
      }

      setUploadStatus("error")
      setErrorMessage(errorMsg)
    } finally {
      setIsUploading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center gap-4">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <h1 className="text-xl font-bold">Sesión inválida</h1>
              <p className="text-sm text-muted-foreground">
                El código QR escaneado no es válido. Por favor, escanea un nuevo código QR.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-background px-4 py-4">
        <div className="flex items-center gap-3">
          <Image
            src="/images/design-mode/Serimag_logo_color-1-scaled(1).png"
            alt="Serimag"
            width={120}
            height={40}
            className="h-10 w-auto object-contain"
          />
          <span className="text-sm font-semibold text-foreground/30 uppercase tracking-wider">x</span>
          <Image
            src="/images/design-mode/Logo-hipoges.webp"
            alt="Hipoges"
            width={101}
            height={29}
            className="h-[1.8rem] w-auto object-contain"
          />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            {uploadStatus === "success" ? (
              <div className="flex flex-col items-center text-center gap-4">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h1 className="text-xl font-bold">¡Documento enviado!</h1>
                <p className="text-sm text-muted-foreground">
                  Tu documento se ha subido correctamente. Puedes ver el resultado en la pantalla del ordenador.
                </p>
                <Button onClick={() => setUploadStatus("idle")} className="w-full">
                  Subir otro documento
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <h1 className="text-2xl font-bold mb-2">Sube tu documento</h1>
                  <p className="text-sm text-muted-foreground">
                    Selecciona un archivo PDF o toma una foto con tu cámara
                  </p>
                </div>

                <div className="space-y-4">
                  <label htmlFor="file-input">
                    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Upload className="h-6 w-6 text-primary" />
                      </div>
                      <div className="text-center">
                        {selectedFile ? (
                          <>
                            <p className="font-medium">{selectedFile.name}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-medium">Toca para seleccionar</p>
                            <p className="text-xs text-muted-foreground mt-1">PDF o imagen</p>
                          </>
                        )}
                      </div>
                    </div>
                  </label>
                  <input
                    id="file-input"
                    type="file"
                    accept=".pdf,image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {isUploading && (
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 text-amber-600 text-sm">
                      <Loader2 className="h-5 w-5 animate-spin flex-shrink-0" />
                      <span>Subiendo documento...</span>
                    </div>
                  )}

                  {uploadStatus === "error" && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <Button onClick={handleUpload} disabled={!selectedFile || isUploading} className="w-full" size="lg">
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Subiendo...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Subir documento
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
