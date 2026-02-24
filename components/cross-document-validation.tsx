'use client'

import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Document } from '@/lib/types'

interface CrossDocumentValidationProps {
  documents: Document[]
}

interface CrossCheckResult {
  label: string
  status: 'ok' | 'error' | 'skip'
  detail: string
}

/** Parse a Spanish-formatted amount like "1.442,74€" into a number */
function parseAmount(raw: string): number | null {
  if (!raw || raw === 'N/D' || raw.toLowerCase().includes('anonimizado')) return null
  const cleaned = raw.replace(/€/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

/** Format a number to Spanish format XX.XXX,XX€ */
function fmt(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'
}

function approxEqual(a: number, b: number, tolerance = 0.05): boolean {
  return Math.abs(a - b) <= tolerance
}

/** Extract albaran numbers referenced inside a factura's Conceptos Facturables */
function getAlbaranRefsFromFactura(doc: Document): { numAlbaran: string; fechaAlbaran: string }[] {
  const conceptosRaw = doc.extractedData?.['Conceptos Facturables']?.value || ''
  const refs: { numAlbaran: string; fechaAlbaran: string }[] = []
  try {
    const parsed = JSON.parse(conceptosRaw)
    if (Array.isArray(parsed)) {
      for (const grupo of parsed) {
        if (grupo.numAlbaran && grupo.numAlbaran !== 'N/D') {
          refs.push({
            numAlbaran: grupo.numAlbaran,
            fechaAlbaran: grupo.fechaAlbaran || 'N/D',
          })
        }
      }
    }
  } catch { /* ignore */ }
  return refs
}

/** Get importe total per albaran group from factura conceptos */
function getAlbaranTotalsFromFactura(doc: Document): Map<string, number> {
  const conceptosRaw = doc.extractedData?.['Conceptos Facturables']?.value || ''
  const totals = new Map<string, number>()
  try {
    const parsed = JSON.parse(conceptosRaw)
    if (Array.isArray(parsed)) {
      for (const grupo of parsed) {
        if (grupo.numAlbaran && grupo.numAlbaran !== 'N/D' && Array.isArray(grupo.conceptos)) {
          let sum = 0
          for (const c of grupo.conceptos) {
            const bi = parseAmount(c.baseImponible)
            if (bi !== null) sum += bi
          }
          totals.set(grupo.numAlbaran, sum)
        }
      }
    }
  } catch { /* ignore */ }
  return totals
}

function runCrossChecks(documents: Document[]): CrossCheckResult[] {
  const checks: CrossCheckResult[] = []

  const facturas = documents.filter(d =>
    d.documentType?.type.toLowerCase().includes('factura') && d.extractedData
  )
  const albaranes = documents.filter(d =>
    (d.documentType?.type.toLowerCase().includes('albaran') || d.documentType?.type.toLowerCase().includes('albarán')) && d.extractedData
  )

  if (facturas.length === 0 && albaranes.length === 0) {
    checks.push({
      label: 'Sin documentos para validar',
      status: 'skip',
      detail: 'No se encontraron facturas ni albaranes procesados',
    })
    return checks
  }

  // 1. Check: Albaranes referenced in facturas exist as standalone documents
  for (const factura of facturas) {
    const facturaNum = factura.extractedData?.['Numero de Factura']?.value || 'Desconocida'
    const albaranRefs = getAlbaranRefsFromFactura(factura)

    if (albaranRefs.length === 0) {
      checks.push({
        label: `Factura ${facturaNum}: Sin albaranes referenciados`,
        status: 'skip',
        detail: 'La factura no referencia albaranes en sus conceptos facturables',
      })
      continue
    }

    // Check each referenced albaran
    for (const ref of albaranRefs) {
      const matchingAlbaran = albaranes.find(a => {
        const albaranNum = a.extractedData?.['Numero de Albaran']?.value || ''
        // Normalize: strip leading zeros for comparison
        const normRef = ref.numAlbaran.replace(/^0+/, '')
        const normAlb = albaranNum.replace(/^0+/, '')
        return normRef === normAlb
      })

      if (matchingAlbaran) {
        checks.push({
          label: `Albaran ${ref.numAlbaran} presente en expediente`,
          status: 'ok',
          detail: `El albaran referenciado en Factura ${facturaNum} existe como documento independiente`,
        })
      } else {
        checks.push({
          label: `Albaran ${ref.numAlbaran} no encontrado`,
          status: 'error',
          detail: `La Factura ${facturaNum} referencia el albaran ${ref.numAlbaran} pero no se encontro como documento independiente en el expediente`,
        })
      }
    }
  }

  // 2. Check: Totals match between factura albaran groups and standalone albaranes
  for (const factura of facturas) {
    const facturaNum = factura.extractedData?.['Numero de Factura']?.value || 'Desconocida'
    const albaranTotals = getAlbaranTotalsFromFactura(factura)

    for (const [albaranNum, facturaAlbaranTotal] of albaranTotals) {
      const matchingAlbaran = albaranes.find(a => {
        const num = a.extractedData?.['Numero de Albaran']?.value || ''
        return num.replace(/^0+/, '') === albaranNum.replace(/^0+/, '')
      })

      if (!matchingAlbaran) continue

      const albaranBaseTotal = parseAmount(matchingAlbaran.extractedData?.['Base Imponible Total']?.value || '')

      if (albaranBaseTotal !== null && facturaAlbaranTotal > 0) {
        const ok = approxEqual(facturaAlbaranTotal, albaranBaseTotal, 0.10)
        checks.push({
          label: `Importe Albaran ${albaranNum} cuadra con factura`,
          status: ok ? 'ok' : 'error',
          detail: ok
            ? `Base imponible en factura (${fmt(facturaAlbaranTotal)}) = Base en albaran (${fmt(albaranBaseTotal)})`
            : `Base imponible en factura (${fmt(facturaAlbaranTotal)}) ≠ Base en albaran (${fmt(albaranBaseTotal)})`,
        })
      }
    }
  }

  // 3. Check: Dates consistency - albaran date should be before factura date
  for (const factura of facturas) {
    const facturaNum = factura.extractedData?.['Numero de Factura']?.value || 'Desconocida'
    const facturaDateRaw = factura.extractedData?.['Fecha de Emision']?.value || ''
    const facturaDate = parseSpanishDate(facturaDateRaw)

    if (!facturaDate) continue

    const albaranRefs = getAlbaranRefsFromFactura(factura)

    for (const ref of albaranRefs) {
      const matchingAlbaran = albaranes.find(a => {
        const num = a.extractedData?.['Numero de Albaran']?.value || ''
        return num.replace(/^0+/, '') === ref.numAlbaran.replace(/^0+/, '')
      })

      if (!matchingAlbaran) continue

      const albaranDateRaw = matchingAlbaran.extractedData?.['Fecha de Albaran']?.value || ''
      const albaranDate = parseSpanishDate(albaranDateRaw)

      if (albaranDate) {
        const ok = albaranDate <= facturaDate
        checks.push({
          label: `Fecha Albaran ${ref.numAlbaran} anterior a factura`,
          status: ok ? 'ok' : 'error',
          detail: ok
            ? `Albaran (${albaranDateRaw}) es anterior o igual a Factura ${facturaNum} (${facturaDateRaw})`
            : `Albaran (${albaranDateRaw}) es POSTERIOR a Factura ${facturaNum} (${facturaDateRaw})`,
        })
      }
    }
  }

  // 4. Check: Standalone albaranes not referenced in any factura
  for (const albaran of albaranes) {
    const albaranNum = albaran.extractedData?.['Numero de Albaran']?.value || ''
    const normAlb = albaranNum.replace(/^0+/, '')

    let referenced = false
    for (const factura of facturas) {
      const refs = getAlbaranRefsFromFactura(factura)
      if (refs.some(r => r.numAlbaran.replace(/^0+/, '') === normAlb)) {
        referenced = true
        break
      }
    }

    if (!referenced && albaranNum) {
      checks.push({
        label: `Albaran ${albaranNum} sin factura asociada`,
        status: 'error',
        detail: `El albaran ${albaranNum} no esta referenciado en ninguna factura del expediente`,
      })
    }
  }

  // 5. Check: Total factura = sum of all albaran totals (if all albaranes are present)
  for (const factura of facturas) {
    const facturaNum = factura.extractedData?.['Numero de Factura']?.value || 'Desconocida'
    const totalFactura = parseAmount(factura.extractedData?.['Base Imponible Total']?.value || '')
    const albaranTotals = getAlbaranTotalsFromFactura(factura)

    if (totalFactura !== null && albaranTotals.size > 0) {
      let sumAlbaranes = 0
      for (const [, total] of albaranTotals) {
        sumAlbaranes += total
      }

      const ok = approxEqual(sumAlbaranes, totalFactura, 0.10)
      checks.push({
        label: `Suma albaranes = Base imponible Factura ${facturaNum}`,
        status: ok ? 'ok' : 'error',
        detail: ok
          ? `Suma albaranes (${fmt(sumAlbaranes)}) = Base imponible factura (${fmt(totalFactura)})`
          : `Suma albaranes (${fmt(sumAlbaranes)}) ≠ Base imponible factura (${fmt(totalFactura)})`,
      })
    }
  }

  return checks
}

/** Parse DD/MM/YYYY to a Date */
function parseSpanishDate(raw: string): Date | null {
  if (!raw || raw === 'N/D') return null
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const [, day, month, year] = match
  const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  return isNaN(d.getTime()) ? null : d
}

export function CrossDocumentValidation({ documents }: CrossDocumentValidationProps) {
  const allComplete = documents.length > 0 && documents.every(d => d.status === 'complete')

  if (!allComplete) return null

  const checks = runCrossChecks(documents)

  if (checks.length === 0) return null

  const allOk = checks.every(c => c.status === 'ok')
  const hasErrors = checks.some(c => c.status === 'error')

  return (
    <Card className={`shadow-sm ${hasErrors ? 'border-red-300 dark:border-red-700' : allOk ? 'border-green-300 dark:border-green-700' : 'border-amber-300 dark:border-amber-700'}`}>
      <CardHeader className="border-b px-6 py-5">
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-sm ${
            hasErrors ? 'bg-red-100 dark:bg-red-900/30' : allOk ? 'bg-green-100 dark:bg-green-900/30' : 'bg-amber-100 dark:bg-amber-900/30'
          }`}>
            <ShieldCheck className={`h-6 w-6 ${
              hasErrors ? 'text-red-600' : allOk ? 'text-green-600' : 'text-amber-600'
            }`} />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">Validaciones Interdocumentales</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Comprobaciones de coherencia entre facturas y albaranes del expediente
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
