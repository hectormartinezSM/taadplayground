"use client"

import { useEffect, useState } from "react"
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Maximize2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ImageViewerProps {
  images: string[]
  initialIndex: number
  onClose: () => void
  pageLabels?: string[]
}

export function ImageViewer({ images, initialIndex, onClose, pageLabels }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [fitMode, setFitMode] = useState<"contain" | "width">("contain")

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowLeft") {
        goToPrevious()
      } else if (e.key === "ArrowRight") {
        goToNext()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [currentIndex, images.length])

  useEffect(() => {
    setZoom(100)
    setRotation(0)
  }, [currentIndex])

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length)
  }

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
  }

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 25, 300))
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 25, 50))
  }

  const handleResetZoom = () => {
    setZoom(100)
  }

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360)
  }

  const toggleFitMode = () => {
    setFitMode((prev) => (prev === "contain" ? "width" : "contain"))
  }

  const handleDownload = async () => {
    const currentImage = images[currentIndex]
    if (!currentImage) return

    try {
      const response = await fetch(currentImage)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${pageLabels?.[currentIndex] || `Página ${currentIndex + 1}`}.png`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error("Error downloading image:", error)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
      {/* Top Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-lg bg-black/80 px-3 py-2 shadow-lg border border-white/10">
        {/* Zoom Controls */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-white hover:bg-white/20 h-8 w-8"
          onClick={handleZoomOut}
          disabled={zoom <= 50}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <button
          onClick={handleResetZoom}
          className="text-xs text-white hover:text-primary px-2 min-w-[3.5rem] font-medium"
        >
          {zoom}%
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-white hover:bg-white/20 h-8 w-8"
          onClick={handleZoomIn}
          disabled={zoom >= 300}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-white/20 mx-1" />

        {/* Rotation Control */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-white hover:bg-white/20 h-8 w-8"
          onClick={handleRotate}
          title="Rotar 90°"
        >
          <RotateCw className="h-4 w-4" />
        </Button>

        {/* Fit Mode Toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-white hover:bg-white/20 h-8 w-8"
          onClick={toggleFitMode}
          title={fitMode === "contain" ? "Ajustar ancho" : "Ajustar pantalla"}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-white/20 mx-1" />

        {/* Download */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-white hover:bg-white/20 h-8 w-8"
          onClick={handleDownload}
          title="Descargar"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {/* Close Button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4 text-white hover:bg-white/20"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </Button>

      {/* Navigation Buttons */}
      {images.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
            onClick={goToPrevious}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
            onClick={goToNext}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        </>
      )}

      {/* Image Display */}
      <div className="flex max-h-[90vh] max-w-[90vw] flex-col items-center overflow-auto">
        <div
          className="transition-transform duration-200"
          style={{
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
            transformOrigin: "center center",
          }}
        >
          <img
            src={images[currentIndex] || "/placeholder.svg"}
            alt={pageLabels?.[currentIndex] || `Página ${currentIndex + 1}`}
            className="max-h-[80vh] max-w-full"
            style={{
              objectFit: fitMode === "contain" ? "contain" : "cover",
              width: fitMode === "width" ? "90vw" : "auto",
            }}
          />
        </div>

        {/* Image Counter */}
        <div className="mt-4 rounded-lg bg-black/80 px-4 py-2 text-sm text-white border border-white/10">
          {pageLabels?.[currentIndex] || `Página ${currentIndex + 1}`} de {images.length}
        </div>
      </div>
    </div>
  )
}
