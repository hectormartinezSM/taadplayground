'use client'

import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import type { ExtractedField } from '@/lib/types'

interface ValidationChecksProps {
  extractedData: Record<string, ExtractedField>
  documentType: string
}

interface CheckResult {
  label: string
  status: 'ok' | 'error' | 'skip'
  detail: string
}

/** Parse a Spanish-formatted amount like "1.442,74€" or "1.442,74" into a number */
function parseAmount(raw: string): number | null {
  if (!raw || raw === 'N/D' || raw.toLowerCase().includes('anonimizado')) return null
  // Remove euro sign, spaces, and dots (thousands), then replace comma with dot
  const cleaned = raw.replace(/€/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

/** Format a number back to Spanish format XX.XXX,XX€ */
function fmt(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'
}

/** Check tolerance (0.02€ tolerance for rounding) */
function approxEqual(a: number, b: number, tolerance = 0.02): boolean {
  return Math.abs(a - b) <= tolerance
}

// ----- Factura Proveedor checks -----

function runFacturaChecks(data: Record<string, ExtractedField>): CheckResult[] {
  const checks: CheckResult[] = []

  // 1. Cuadra base imponible total: sum of bases in conceptos == Base Imponible Total
  const baseImponibleTotal = parseAmount(data['Base Imponible Total']?.value || '')
  const conceptosRaw = data['Conceptos Facturables']?.value || ''

  let sumBases: number | null = null
  try {
    const parsed = JSON.parse(conceptosRaw)
    if (Array.isArray(parsed)) {
      let total = 0
      let hasBases = false
      for (const grupo of parsed) {
        const conceptos = grupo.conceptos || [grupo]
        for (const c of conceptos) {
          const bi = parseAmount(c.baseImponible)
          if (bi !== null) {
            total += bi
            hasBases = true
          }
        }
      }
      if (hasBases) sumBases = total
    }
  } catch { /* ignore */ }

  if (baseImponibleTotal !== null && sumBases !== null) {
    const ok = approxEqual(sumBases, baseImponibleTotal)
    checks.push({
      label: 'Cuadra Base Imponible Total',
      status: ok ? 'ok' : 'error',
      detail: ok
        ? `Suma de bases (${fmt(sumBases)}) = Base Imponible Total (${fmt(baseImponibleTotal)})`
        : `Suma de bases (${fmt(sumBases)}) ≠ Base Imponible Total (${fmt(baseImponibleTotal)})`,
    })
  } else {
    checks.push({
      label: 'Cuadra Base Imponible Total',
      status: 'skip',
      detail: 'No se pudieron obtener los valores necesarios para la validacion',
    })
  }

  // 2. Cuadra impuesto indirecto: % IVA sobre base == cuota IVA
  const desgloseRaw = data['Desglose Impuesto Indirecto']?.value || ''
  let impuestoOk = true
  let impuestoDetail = ''
  let hasDesglose = false

  try {
    const desglose = JSON.parse(desgloseRaw)
    if (Array.isArray(desglose) && desglose.length > 0) {
      hasDesglose = true
      const details: string[] = []
      for (const tramo of desglose) {
        const base = parseAmount(tramo.base)
        const cuota = parseAmount(tramo.cuota)
        // Extract percentage from tipo string, e.g. "IVA 21%" -> 21
        const pctMatch = tramo.tipo?.match(/(\d+(?:[.,]\d+)?)\s*%/)
        const pct = pctMatch ? parseFloat(pctMatch[1].replace(',', '.')) : null

        if (base !== null && cuota !== null && pct !== null) {
          const expected = base * pct / 100
          const ok = approxEqual(expected, cuota, 0.05)
          if (!ok) impuestoOk = false
          details.push(`${tramo.tipo}: ${fmt(base)} x ${pct}% = ${fmt(expected)} vs cuota ${fmt(cuota)} ${ok ? 'OK' : 'ERROR'}`)
        } else {
          details.push(`${tramo.tipo}: datos insuficientes para validar`)
        }
      }
      impuestoDetail = details.join(' | ')
    }
  } catch { /* ignore */ }

  if (hasDesglose) {
    checks.push({
      label: 'Cuadra Impuesto Indirecto',
      status: impuestoOk ? 'ok' : 'error',
      detail: impuestoDetail,
    })
  } else {
    checks.push({
      label: 'Cuadra Impuesto Indirecto',
      status: 'skip',
      detail: 'No se encontro desglose de impuesto indirecto',
    })
  }

  // 3. Cuadra total factura: Base Imponible Total + sum of cuotas impuesto = Total Factura
  const totalFactura = parseAmount(data['Total Factura']?.value || '')
  let sumCuotas: number | null = null

  try {
    const desglose = JSON.parse(desgloseRaw)
    if (Array.isArray(desglose) && desglose.length > 0) {
      let total = 0
      let hasCuotas = false
      for (const tramo of desglose) {
        const cuota = parseAmount(tramo.cuota)
        if (cuota !== null) {
          total += cuota
          hasCuotas = true
        }
      }
      if (hasCuotas) sumCuotas = total
    }
  } catch { /* ignore */ }

  if (baseImponibleTotal !== null && sumCuotas !== null && totalFactura !== null) {
    const expectedTotal = baseImponibleTotal + sumCuotas
    const ok = approxEqual(expectedTotal, totalFactura, 0.05)
    checks.push({
      label: 'Cuadra Total Factura',
      status: ok ? 'ok' : 'error',
      detail: ok
        ? `Base (${fmt(baseImponibleTotal)}) + Impuestos (${fmt(sumCuotas)}) = ${fmt(expectedTotal)} = Total (${fmt(totalFactura)})`
        : `Base (${fmt(baseImponibleTotal)}) + Impuestos (${fmt(sumCuotas)}) = ${fmt(expectedTotal)} ≠ Total (${fmt(totalFactura)})`,
    })
  } else if (baseImponibleTotal !== null && totalFactura !== null && sumCuotas === null) {
    // No tax breakdown, check if base == total (exento)
    const ok = approxEqual(baseImponibleTotal, totalFactura)
    checks.push({
      label: 'Cuadra Total Factura',
      status: ok ? 'ok' : 'error',
      detail: ok
        ? `Sin impuestos: Base (${fmt(baseImponibleTotal)}) = Total (${fmt(totalFactura)})`
        : `Base (${fmt(baseImponibleTotal)}) ≠ Total (${fmt(totalFactura)}) y no hay desglose de impuestos`,
    })
  } else {
    checks.push({
      label: 'Cuadra Total Factura',
      status: 'skip',
      detail: 'No se pudieron obtener los valores necesarios para la validacion',
    })
  }

  return checks
}

// ----- Component -----

export function ValidationChecks({ extractedData, documentType }: ValidationChecksProps) {
  const isFactura = documentType.toLowerCase().includes('factura')

  if (!isFactura) return null

  const checks = runFacturaChecks(extractedData)

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <h4 className="text-sm font-semibold text-foreground">Validaciones Automaticas</h4>
      <div className="space-y-2">
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
    </div>
  )
}
