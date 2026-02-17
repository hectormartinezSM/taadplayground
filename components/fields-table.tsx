"use client"

import type React from "react"

import { useState } from "react"
import type { Field, ExtractedField } from "@/lib/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Loader2 } from "lucide-react"

interface FieldsTableProps {
  fields: Field[]
  extractedData?: Record<string, ExtractedField>
  isExtracting: boolean
  onAddCustomField?: (fieldName: string) => Promise<void>
  isComplete?: boolean
}

interface Situacion {
  empresa: string
  fechaAlta: string
  fechaBaja: string
  diasCotizados?: number | string
}

interface Titularidad {
  titular: string
  dni: string
  tipoDerecho: string
  participacion: string
}

interface Retencion {
  nombre: string
  porcentaje: string
  importe: string
}

interface Devengo {
  concepto: string
  tipo?: string
  importe: string
}

interface Carga {
  numeroInscripcion: string
  fechaInscripcion: string
  tipoCarga: string
  subtipo: string
  notario: string
  fechaNotarial: string
  entidad: string
  importe: string
  fechaVencimiento: string
  interesesOrdinarios: string
  interesesDemora: string
  costasGastos: string
}

function parseSituaciones(value: string): Situacion[] | null {
  try {
    // Try to parse as JSON
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].empresa) {
      return parsed
    }
  } catch {
    // If JSON parsing fails, try to parse the old pipe-separated format
    const lines = value.split("\n").filter((line) => line.trim())
    if (lines.length > 0 && lines[0].includes("|")) {
      return lines.map((line) => {
        const parts = line.split("|").map((p) => p.trim())
        return {
          empresa: parts[0] || "",
          fechaAlta: parts[1] || "",
          fechaBaja: parts[2] || "---",
          diasCotizados: parts[3] || "",
        }
      })
    }
  }
  return null
}

function parseTitularidades(value: string): Titularidad[] | null {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].titular) {
      return parsed
    }
  } catch {
    // If JSON parsing fails, try pipe-separated format
    const lines = value.split("\n").filter((line) => line.trim())
    if (lines.length > 0 && lines[0].includes("|")) {
      return lines.map((line) => {
        const parts = line.split("|").map((p) => p.trim())
        return {
          titular: parts[0] || "",
          dni: parts[1] || "N/D",
          tipoDerecho: parts[2] || "",
          participacion: parts[3] || "",
        }
      })
    }
  }
  return null
}

function parseRetenciones(value: string): Retencion[] | null {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].nombre) {
      return parsed
    }
  } catch {
    // If JSON parsing fails, try pipe-separated format
    const lines = value.split("\n").filter((line) => line.trim())
    if (lines.length > 0 && lines[0].includes("|")) {
      return lines.map((line) => {
        const parts = line.split("|").map((p) => p.trim())
        return {
          nombre: parts[0] || "",
          porcentaje: parts[1] || "---",
          importe: parts[2] || "",
        }
      })
    }
  }
  return null
}

function parseDevengos(value: string): Devengo[] | null {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].concepto) {
      return parsed
    }
  } catch {
    // If JSON parsing fails, try pipe-separated format
    const lines = value.split("\n").filter((line) => line.trim())
    if (lines.length > 0 && lines[0].includes("|")) {
      return lines.map((line) => {
        const parts = line.split("|").map((p) => p.trim())
        return {
          concepto: parts[0] || "",
          tipo: parts[1] || "",
          importe: parts[2] || "",
        }
      })
    }
  }
  return null
}

function parseCargas(value: string): Carga[] | null {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      // Empty array means "sin cargas"
      if (parsed.length === 0) return []
      if (parsed[0].tipoCarga || parsed[0].entidad || parsed[0].numeroInscripcion) {
        return parsed
      }
    }
  } catch {
    // Not JSON, ignore
  }
  return null
}

function SituacionesTable({ situaciones }: { situaciones: Situacion[] }) {
  const hasDias = situaciones.some((s) => s.diasCotizados !== undefined && s.diasCotizados !== "")

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs font-semibold">Empresa</TableHead>
            <TableHead className="text-xs font-semibold w-28">Fecha Alta</TableHead>
            <TableHead className="text-xs font-semibold w-28">Fecha Baja</TableHead>
            {hasDias && <TableHead className="text-xs font-semibold w-24 text-right">Días Cotizados</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {situaciones.map((sit, idx) => (
            <TableRow key={idx}>
              <TableCell className="text-sm py-2">{sit.empresa}</TableCell>
              <TableCell className="text-sm py-2">{sit.fechaAlta}</TableCell>
              <TableCell className="text-sm py-2">{sit.fechaBaja}</TableCell>
              {hasDias && <TableCell className="text-sm py-2 text-right">{sit.diasCotizados}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function TitularidadesTable({ titularidades }: { titularidades: Titularidad[] }) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs font-semibold whitespace-nowrap w-48">Titular</TableHead>
            <TableHead className="text-xs font-semibold whitespace-nowrap w-28">DNI</TableHead>
            <TableHead className="text-xs font-semibold whitespace-nowrap w-36">Tipo de Derecho</TableHead>
            <TableHead className="text-xs font-semibold text-left">Participacion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {titularidades.map((tit, idx) => (
            <TableRow key={idx}>
              <TableCell className="text-sm py-2 whitespace-nowrap">{tit.titular}</TableCell>
              <TableCell className="text-sm py-2 whitespace-nowrap">{tit.dni}</TableCell>
              <TableCell className="text-sm py-2 whitespace-nowrap">{tit.tipoDerecho}</TableCell>
              <TableCell className="text-sm py-2 text-left">{tit.participacion}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function RetencionesTable({ retenciones }: { retenciones: Retencion[] }) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs font-semibold">Concepto</TableHead>
            <TableHead className="text-xs font-semibold w-24 text-right">Porcentaje</TableHead>
            <TableHead className="text-xs font-semibold w-28 text-right">Importe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {retenciones.map((ret, idx) => (
            <TableRow key={idx}>
              <TableCell className="text-sm py-2">{ret.nombre}</TableCell>
              <TableCell className="text-sm py-2 text-right">
                {ret.porcentaje !== "---" ? `${ret.porcentaje}%` : "---"}
              </TableCell>
              <TableCell className="text-sm py-2 text-right">{ret.importe} €</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function DevengosTable({ devengos }: { devengos: Devengo[] }) {
  const hasTipo = devengos.some((d) => d.tipo)

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs font-semibold">Concepto</TableHead>
            {hasTipo && <TableHead className="text-xs font-semibold w-40">Tipo</TableHead>}
            <TableHead className="text-xs font-semibold w-28 text-right">Importe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devengos.map((dev, idx) => (
            <TableRow key={idx}>
              <TableCell className="text-sm py-2">{dev.concepto}</TableCell>
              {hasTipo && <TableCell className="text-sm py-2">{dev.tipo || "—"}</TableCell>}
              <TableCell className="text-sm py-2 text-right">{dev.importe} €</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// Format a numeric string to Spanish currency: XXX.XXX.XXX,XX €
function formatEUR(v: string): string {
  if (!v || v === "N/D" || v === "-") return "-"
  // Normalize: remove existing dots/spaces (thousands), keep comma as decimal
  const cleaned = v.replace(/\s/g, "").replace(/\./g, "")
  // If comma is present, split on it
  const parts = cleaned.split(",")
  const intPart = parts[0].replace(/[^\d]/g, "")
  const decPart = parts[1] ? parts[1].replace(/[^\d]/g, "").slice(0, 2).padEnd(2, "0") : "00"
  if (!intPart) return "-"
  // Add thousands separators with dots
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return `${formatted},${decPart} \u20AC`
}

// Field definitions for transposed rendering
const CARGA_FIELD_DEFS: { key: keyof Carga; label: string; format?: (v: string) => string }[] = [
  { key: "numeroInscripcion", label: "N. Inscripcion" },
  { key: "fechaInscripcion", label: "Fecha Inscripcion" },
  { key: "tipoCarga", label: "Tipo de carga" },
  { key: "subtipo", label: "Subtipo" },
  { key: "notario", label: "Notario" },
  { key: "fechaNotarial", label: "Fecha notarial" },
  { key: "entidad", label: "Entidad" },
  { key: "importe", label: "Importe", format: formatEUR },
  { key: "fechaVencimiento", label: "Fecha vencimiento" },
  { key: "interesesOrdinarios", label: "Int. ordinarios", format: formatEUR },
  { key: "interesesDemora", label: "Int. demora", format: formatEUR },
  { key: "costasGastos", label: "Costas y gastos", format: formatEUR },
]

function getCargaColumnHeader(carga: Carga, idx: number): string {
  const tipo = carga.tipoCarga && carga.tipoCarga !== "N/D" && carga.tipoCarga !== "-" ? carga.tipoCarga : ""
  const num = carga.numeroInscripcion && carga.numeroInscripcion !== "N/D" && carga.numeroInscripcion !== "-" ? carga.numeroInscripcion : ""
  if (tipo && num) return `${tipo} ${num}`
  if (tipo) return `${tipo} ${idx + 1}`
  return `Carga ${idx + 1}`
}

function CargasTable({ cargas }: { cargas: Carga[] }) {
  if (cargas.length === 0) {
    return (
      <div className="rounded-md border border-border p-4 text-sm text-muted-foreground text-center">
        Sin cargas
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs font-semibold whitespace-nowrap text-left min-w-[160px]">Campo</TableHead>
            {cargas.map((carga, idx) => (
              <TableHead key={idx} className="text-xs font-semibold whitespace-nowrap text-left min-w-[160px]">
                {getCargaColumnHeader(carga, idx)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {CARGA_FIELD_DEFS.map((field) => (
            <TableRow key={field.key}>
              <TableCell className="text-xs font-medium text-muted-foreground py-2 whitespace-nowrap bg-muted/20">
                {field.label}
              </TableCell>
              {cargas.map((carga, idx) => {
                const raw = carga[field.key] || "-"
                const display = field.format ? field.format(raw) : raw
                return (
                  <TableCell key={idx} className="text-sm py-2 whitespace-nowrap">
                    {display}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function FieldsTable({
  fields,
  extractedData,
  isExtracting,
  onAddCustomField,
  isComplete = false,
}: FieldsTableProps) {
  const [isAddingField, setIsAddingField] = useState(false)
  const [newFieldName, setNewFieldName] = useState("")
  const [isExtractingNewField, setIsExtractingNewField] = useState(false)

  const handleAddField = async () => {
    if (!newFieldName.trim() || !onAddCustomField) return

    setIsExtractingNewField(true)
    try {
      await onAddCustomField(newFieldName.trim())
      setNewFieldName("")
      setIsAddingField(false)
    } catch (error) {
      console.error("[v0] Error adding custom field:", error)
    } finally {
      setIsExtractingNewField(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleAddField()
    }
  }

  const renderFieldValue = (fieldName: string, extracted: ExtractedField | undefined) => {
    if (!extracted) {
      return <span className="text-muted-foreground">—</span>
    }

    // Check if this is the Situaciones field and try to parse it
    if (fieldName.toLowerCase() === "situaciones") {
      const situaciones = parseSituaciones(extracted.value)
      if (situaciones && situaciones.length > 0) {
        return <SituacionesTable situaciones={situaciones} />
      }
    }

    if (fieldName.toLowerCase() === "titularidades") {
      const titularidades = parseTitularidades(extracted.value)
      if (titularidades && titularidades.length > 0) {
        return <TitularidadesTable titularidades={titularidades} />
      }
    }

    if (fieldName.toLowerCase() === "retenciones") {
      const retenciones = parseRetenciones(extracted.value)
      if (retenciones && retenciones.length > 0) {
        return <RetencionesTable retenciones={retenciones} />
      }
    }

    if (fieldName.toLowerCase() === "devengos") {
      const devengos = parseDevengos(extracted.value)
      if (devengos && devengos.length > 0) {
        return <DevengosTable devengos={devengos} />
      }
    }

    if (fieldName.toLowerCase() === "cargas") {
      const cargas = parseCargas(extracted.value)
      if (cargas !== null) {
        return <CargasTable cargas={cargas} />
      }
    }

    return <span className="animate-in fade-in duration-300">{extracted.value}</span>
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/3">Campo</TableHead>
            <TableHead className="w-2/3">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field) => {
            const extracted = extractedData?.[field.name]
            const isSituaciones =
              field.name.toLowerCase() === "situaciones" && extracted && parseSituaciones(extracted.value)
            const isTitularidades =
              field.name.toLowerCase() === "titularidades" && extracted && parseTitularidades(extracted.value)
            const isRetenciones =
              field.name.toLowerCase() === "retenciones" && extracted && parseRetenciones(extracted.value)
            const isDevengos = field.name.toLowerCase() === "devengos" && extracted && parseDevengos(extracted.value)
            const isCargas = field.name.toLowerCase() === "cargas" && extracted && parseCargas(extracted.value) !== null
            const isTableField = isSituaciones || isTitularidades || isRetenciones || isDevengos || isCargas

            return (
              <TableRow key={field.name}>
                <TableCell className={`font-medium ${isTableField ? "align-top pt-4" : ""}`}>{field.name}</TableCell>
                <TableCell className={isTableField ? "py-2" : ""}>
                  {isExtracting && !extracted ? (
                    <Skeleton className="h-5 w-full" />
                  ) : (
                    renderFieldValue(field.name, extracted)
                  )}
                </TableCell>
              </TableRow>
            )
          })}

          {isComplete && onAddCustomField && (
            <>
              {isAddingField ? (
                <TableRow>
                  <TableCell>
                    <Input
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Nombre del campo..."
                      disabled={isExtractingNewField}
                      autoFocus
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    {isExtractingNewField ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Extrayendo...</span>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleAddField} disabled={!newFieldName.trim()}>
                          Extraer
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setIsAddingField(false)
                            setNewFieldName("")
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell colSpan={2}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsAddingField(true)}
                      className="w-full gap-2 text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                      Añadir campo personalizado
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
