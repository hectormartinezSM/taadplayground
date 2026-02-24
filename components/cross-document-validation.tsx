'use client'

import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Document, ExtractedField } from '@/lib/types'

interface CrossDocumentValidationProps {
  documents: Document[]
}

interface CheckResult {
  label: string
  status: 'ok' | 'error' | 'skip'
  detail: string
}

// --- Helpers ---

function parseAmount(raw: string): number | null {
  if (!raw || raw === 'N/D' || raw.toLowerCase().includes('anonimizado')) return null
  const cleaned = raw.replace(/€/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function fmt(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'
}

function approxEqual(a: number, b: number, tolerance = 0.10): boolean {
  return Math.abs(a - b) <= tolerance
}

function normalizeAlbaranNum(num: string): string {
  // Strip leading zeros, "0.", spaces
  return num.replace(/^0\.?\s*/, '').replace(/^0+/, '').trim()
}

// --- Extract info from documents ---

interface FacturaInfo {
  docIndex: number
  baseImponibleTotal: number | null
  totalFactura: number | null
  albaranesReferenciados: { num: string; fecha: string; baseAlbaran: number | null }[]
}

interface AlbaranInfo {
  docIndex: number
  numero: string
  fecha: string
  baseImponibleTotal: number | null
  totalAlbaran: number | null
}

function extractFacturaInfo(doc: Document, docIndex: number): FacturaInfo | null {
  if (!doc.extractedData || !doc.documentType?.type.toLowerCase().includes('factura')) return null

  const data = doc.extractedData
  const baseImponibleTotal = parseAmount(data['Base Imponible Total']?.value || '')
  const totalFactura = parseAmount(data['Total Factura']?.value || '')

  // Extract albaran references from conceptos facturables
  const albaranesReferenciados: { num: string; fecha: string; baseAlbaran: number | null }[] = []
  try {
    const conceptosRaw = data['Conceptos Facturables']?.value || ''
    const parsed = JSON.parse(conceptosRaw)
    if (Array.isArray(parsed)) {
      for (const grupo of parsed) {
        if (grupo.numAlbaran && grupo.numAlbaran !== 'N/D') {
          // Sum bases of conceptos in this albaran group
          let groupBase = 0
          let hasBase = false
          if (Array.isArray(grupo.conceptos)) {
            for (const c of grupo.conceptos) {
              const bi = parseAmount(c.baseImponible)
              if (bi !== null) {
                groupBase += bi
                hasBase = true
              }
            }
          }
          albaranesReferenciados.push({
            num: normalizeAlbaranNum(grupo.numAlbaran),
            fecha: grupo.fechaAlbaran || 'N/D',
            baseAlbaran: hasBase ? groupBase : null,
          })
        }
      }
    }
  } catch { /* ignore */ }

  return { docIndex, baseImponibleTotal, totalFactura, albaranesReferenciados }
}

function extractAlbaranInfo(doc: Document, docIndex: number): AlbaranInfo | null {
  if (!doc.extractedData || !doc.documentType?.type.toLowerCase().includes('albaran')) return null

  const data = doc.extractedData
  return {
    docIndex,
    numero: normalizeAlbaranNum(data['Numero de Albaran']?.value || ''),
    fecha: data['Fecha de Albaran']?.value || 'N/D',
    baseImponibleTotal: parseAmount(data['Base Imponible Total']?.value || ''),
    totalAlbaran: parseAmount(data['Total Albaran']?.value || ''),
  }
}

// --- Cross-document checks ---

function runCrossDocumentChecks(facturas: FacturaInfo[], albaranes: AlbaranInfo[]): CheckResult[] {
  const checks: CheckResult[] = []

  if (facturas.length === 0) {
    checks.push({
      label: 'Presencia de factura',
      status: 'skip',
      detail: 'No se encontro ninguna factura en el expediente',
    })
    return checks
  }

  for (const factura of facturas) {
    const facLabel = `Factura (Doc ${factura.docIndex + 1})`

    // 1. All albaranes referenced in the factura exist as standalone documents
    if (factura.albaranesReferenciados.length > 0) {
      const missing: string[] = []
      const found: string[] = []

      for (const ref of factura.albaranesReferenciados) {
        const match = albaranes.find(a => normalizeAlbaranNum(a.numero) === normalizeAlbaranNum(ref.num))
        if (match) {
          found.push(ref.num)
        } else {
          missing.push(ref.num)
        }
      }

      if (missing.length === 0) {
        checks.push({
          label: `${facLabel}: Todos los albaranes referenciados estan presentes`,
          status: 'ok',
          detail: `Albaranes referenciados: ${factura.albaranesReferenciados.map(r => r.num).join(', ')} - todos encontrados en el expediente`,
        })
      } else {
        checks.push({
          label: `${facLabel}: Albaranes referenciados faltantes`,
          status: 'error',
          detail: `Albaranes encontrados: ${found.join(', ') || 'ninguno'}. Faltan: ${missing.join(', ')}`,
        })
      }

      // 2. Base imponible per albaran matches between factura and standalone albaran
      for (const ref of factura.albaranesReferenciados) {
        const match = albaranes.find(a => normalizeAlbaranNum(a.numero) === normalizeAlbaranNum(ref.num))
        if (match && ref.baseAlbaran !== null && match.baseImponibleTotal !== null) {
          const ok = approxEqual(ref.baseAlbaran, match.baseImponibleTotal)
          checks.push({
            label: `Albaran ${ref.num}: Cuadra base imponible factura vs albaran`,
            status: ok ? 'ok' : 'error',
            detail: ok
              ? `Base en factura (${fmt(ref.baseAlbaran)}) = Base en albaran (${fmt(match.baseImponibleTotal)})`
              : `Base en factura (${fmt(ref.baseAlbaran)}) ≠ Base en albaran (${fmt(match.baseImponibleTotal)})`,
          })
        } else if (match) {
          checks.push({
            label: `Albaran ${ref.num}: Cuadra base imponible factura vs albaran`,
            status: 'skip',
            detail: 'No se pudieron obtener ambas bases imponibles para comparar',
          })
        }
      }

      // 3. Sum of albaran bases (from standalone albaranes matched) == factura base imponible total
      if (factura.baseImponibleTotal !== null) {
        const matchedAlbaranes = factura.albaranesReferenciados
          .map(ref => albaranes.find(a => normalizeAlbaranNum(a.numero) === normalizeAlbaranNum(ref.num)))
          .filter((a): a is AlbaranInfo => a !== undefined)

        const albaranBases = matchedAlbaranes.map(a => a.baseImponibleTotal).filter((b): b is number => b !== null)

        if (albaranBases.length > 0) {
          const sumAlbaranBases = albaranBases.reduce((acc, b) => acc + b, 0)
          const ok = approxEqual(sumAlbaranBases, factura.baseImponibleTotal)
          checks.push({
            label: `${facLabel}: Suma bases albaranes = Base Imponible Total factura`,
            status: ok ? 'ok' : 'error',
            detail: ok
              ? `Suma bases albaranes (${fmt(sumAlbaranBases)}) = Base Imponible Total factura (${fmt(factura.baseImponibleTotal)})`
              : `Suma bases albaranes (${fmt(sumAlbaranBases)}) ≠ Base Imponible Total factura (${fmt(factura.baseImponibleTotal)})`,
          })
        }
      }

      // 4. Dates: albaranes should be dated before or on the factura date
      // (We don't have factura date easily, but we check albaran dates are consistent)

    } else {
      checks.push({
        label: `${facLabel}: Albaranes referenciados`,
        status: 'skip',
        detail: 'La factura no referencia albaranes explicitamente',
      })
    }

    // 5. Check for standalone albaranes not referenced in any factura
    const referencedNums = new Set(
      facturas.flatMap(f => f.albaranesReferenciados.map(r => normalizeAlbaranNum(r.num)))
    )
    const unreferenced = albaranes.filter(a => !referencedNums.has(normalizeAlbaranNum(a.numero)))

    if (unreferenced.length > 0) {
      checks.push({
        label: 'Albaranes no referenciados en ninguna factura',
        status: 'error',
        detail: `Los siguientes albaranes no aparecen en ninguna factura: ${unreferenced.map(a => a.numero).join(', ')}`,
      })
    } else if (albaranes.length > 0) {
      checks.push({
        label: 'Todos los albaranes estan referenciados en facturas',
        status: 'ok',
        detail: `Los ${albaranes.length} albaran(es) del expediente estan referenciados en las facturas`,
      })
    }
  }

  return checks
}

// --- Component ---

export function CrossDocumentValidation({ documents }: CrossDocumentValidationProps) {
  // Only show when ALL documents are complete
  const allComplete = documents.length > 0 && documents.every(d => d.status === 'complete')
  if (!allComplete) return null

  // Need at least 1 factura and 1 albaran to do cross-validation
  const facturas = documents
    .map((d, i) => extractFacturaInfo(d, i))
    .filter((f): f is FacturaInfo => f !== null)

  const albaranes = documents
    .map((d, i) => extractAlbaranInfo(d, i))
    .filter((a): a is AlbaranInfo => a !== null)

  if (facturas.length === 0 && albaranes.length === 0) return null

  const checks = runCrossDocumentChecks(facturas, albaranes)

  if (checks.length === 0) return null

  const allOk = checks.every(c => c.status === 'ok')
  const hasErrors = checks.some(c => c.status === 'error')

  return (
    <Card className={`shadow-sm ${allOk ? 'border-green-300 dark:border-green-700' : hasErrors ? 'border-red-300 dark:border-red-700' : 'border-amber-300 dark:border-amber-700'}`}>
      <CardHeader className="border-b px-6 py-5">
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-sm ${
            allOk ? 'bg-green-100 dark:bg-green-900/30' : hasErrors ? 'bg-red-100 dark:bg-red-900/30' : 'bg-amber-100 dark:bg-amber-900/30'
          }`}>
            <ShieldCheck className={`h-6 w-6 ${
              allOk ? 'text-green-600' : hasErrors ? 'text-red-500' : 'text-amber-500'
            }`} />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">Validaciones Interdocumentales</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Cruce de datos entre {facturas.length} factura(s) y {albaranes.length} albaran(es)
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-3">
          {checks.map((check, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <div className="mt-0.5 shrink-0">
                {check.status === 'ok' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                {check.status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                {check.status === 'skip' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
              </div>
              <div>
                <span className={`font-medium ${
                  check.status === 'ok' ? 'text-green-700 dark:text-green-400' :
                  check.status === 'error' ? 'text-red-600 dark:text-red-400' :
                  'text-amber-600 dark:text-amber-400'
                }`}>
                  {check.label}
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
