'use client'

import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Document, ExtractedField } from '@/lib/types'

interface CrossDocumentValidationProps {
  documents: Document[]
}

type CheckStatus = 'ok' | 'error' | 'warning' | 'skip'

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
  return num.replace(/^0\.?\s*/, '').replace(/^0+/, '').trim()
}

// --- Data extraction ---

interface FacturaInfo {
  docIndex: number
  numeroFactura: string
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

  const numeroFactura = data['Numero de Factura']?.value || 'desconocida'
  const baseImponibleTotal = parseAmount(data['Base Imponible Total']?.value || '')
  const totalFactura = parseAmount(data['Total Factura']?.value || '')

  const albaranesReferenciados: { num: string; fecha: string; baseAlbaran: number | null }[] = []
  try {
    const conceptosRaw = data['Conceptos Facturables']?.value || ''
    const parsed = JSON.parse(conceptosRaw)
    if (Array.isArray(parsed)) {
      for (const grupo of parsed) {
        if (grupo.numAlbaran && grupo.numAlbaran !== 'N/D') {
          let groupBase = 0
          let hasBase = false
          if (Array.isArray(grupo.conceptos)) {
            for (const c of grupo.conceptos) {
              const bi = parseAmount(c.baseImponible)
              if (bi !== null) { groupBase += bi; hasBase = true }
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

  return { docIndex, numeroFactura, baseImponibleTotal, totalFactura, albaranesReferenciados }
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

// --- Status icon helper ---
function StatusIcon({ status }: { status: CheckStatus }) {
  switch (status) {
    case 'ok': return <CheckCircle2 className="h-4 w-4 text-green-600" />
    case 'error': return <XCircle className="h-4 w-4 text-red-500" />
    case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />
    case 'skip': return <AlertTriangle className="h-4 w-4 text-gray-400" />
  }
}

function statusColor(status: CheckStatus): string {
  switch (status) {
    case 'ok': return 'text-green-700 dark:text-green-400'
    case 'error': return 'text-red-600 dark:text-red-400'
    case 'warning': return 'text-amber-600 dark:text-amber-400'
    case 'skip': return 'text-gray-500'
  }
}

// --- Component ---

export function CrossDocumentValidation({ documents }: CrossDocumentValidationProps) {
  const allComplete = documents.length > 0 && documents.every(d => d.status === 'complete')
  if (!allComplete) return null

  const facturas = documents.map((d, i) => extractFacturaInfo(d, i)).filter((f): f is FacturaInfo => f !== null)
  const albaranes = documents.map((d, i) => extractAlbaranInfo(d, i)).filter((a): a is AlbaranInfo => a !== null)

  if (facturas.length === 0 && albaranes.length === 0) return null

  // Track global result
  let hasErrors = false
  let hasWarnings = false

  // --- Build sections per factura ---
  const sections = facturas.map(factura => {
    const facLabel = `Factura ${factura.numeroFactura}`

    // 1. Verificacion de referencias
    let refStatus: CheckStatus = 'skip'
    let refMessage = ''
    let refDetail = ''
    const refsFound: string[] = []
    const refsMissing: string[] = []

    if (factura.albaranesReferenciados.length > 0) {
      for (const ref of factura.albaranesReferenciados) {
        const match = albaranes.find(a => normalizeAlbaranNum(a.numero) === normalizeAlbaranNum(ref.num))
        if (match) { refsFound.push(ref.num) } else { refsMissing.push(ref.num) }
      }
      if (refsMissing.length === 0) {
        refStatus = 'ok'
        refMessage = 'La factura referencia correctamente todos los albaranes indicados.'
        refDetail = `Albaranes vinculados: ${factura.albaranesReferenciados.map(r => r.num).join(', ')}`
      } else {
        refStatus = 'error'
        hasErrors = true
        refMessage = 'Existen albaranes referenciados que no estan presentes en el expediente.'
        refDetail = `Encontrados: ${refsFound.join(', ') || 'ninguno'}. Faltan: ${refsMissing.join(', ')}`
      }
    } else {
      refStatus = 'skip'
      refMessage = 'La factura no referencia albaranes explicitamente.'
    }

    // 2. Verificacion de importes por albaran (table data)
    const importeRows: { albaran: string; baseFactura: string; baseAlbaran: string; status: CheckStatus }[] = []
    let allImportesMatch = true
    let hasImporteData = false

    for (const ref of factura.albaranesReferenciados) {
      const match = albaranes.find(a => normalizeAlbaranNum(a.numero) === normalizeAlbaranNum(ref.num))
      if (match && ref.baseAlbaran !== null && match.baseImponibleTotal !== null) {
        hasImporteData = true
        const ok = approxEqual(ref.baseAlbaran, match.baseImponibleTotal)
        if (!ok) { allImportesMatch = false; hasErrors = true }
        importeRows.push({
          albaran: ref.num,
          baseFactura: fmt(ref.baseAlbaran),
          baseAlbaran: fmt(match.baseImponibleTotal),
          status: ok ? 'ok' : 'error',
        })
      } else if (match) {
        importeRows.push({
          albaran: ref.num,
          baseFactura: ref.baseAlbaran !== null ? fmt(ref.baseAlbaran) : 'N/D',
          baseAlbaran: match.baseImponibleTotal !== null ? fmt(match.baseImponibleTotal) : 'N/D',
          status: 'skip',
        })
      }
    }

    // 3. Cuadre global acumulado
    let globalStatus: CheckStatus = 'skip'
    let globalSumaAlbaranes = ''
    let globalBaseFactura = ''
    let globalMessage = ''

    if (factura.baseImponibleTotal !== null) {
      const matchedAlbaranes = factura.albaranesReferenciados
        .map(ref => albaranes.find(a => normalizeAlbaranNum(a.numero) === normalizeAlbaranNum(ref.num)))
        .filter((a): a is AlbaranInfo => a !== undefined)

      const albaranBases = matchedAlbaranes.map(a => a.baseImponibleTotal).filter((b): b is number => b !== null)

      if (albaranBases.length > 0) {
        const sum = albaranBases.reduce((acc, b) => acc + b, 0)
        const ok = approxEqual(sum, factura.baseImponibleTotal)
        globalStatus = ok ? 'ok' : 'error'
        if (!ok) hasErrors = true
        globalSumaAlbaranes = fmt(sum)
        globalBaseFactura = fmt(factura.baseImponibleTotal)
        globalMessage = ok
          ? 'El total acumulado de los albaranes coincide con la base imponible total de la factura.'
          : 'El total acumulado NO coincide con la base imponible total de la factura.'
      }
    }

    return {
      facLabel,
      refStatus, refMessage, refDetail,
      importeRows, allImportesMatch, hasImporteData,
      globalStatus, globalSumaAlbaranes, globalBaseFactura, globalMessage,
    }
  })

  // 4. Comprobacion de albaranes pendientes (global)
  const allReferencedNums = new Set(
    facturas.flatMap(f => f.albaranesReferenciados.map(r => normalizeAlbaranNum(r.num)))
  )
  const unreferencedAlbaranes = albaranes.filter(a => !allReferencedNums.has(normalizeAlbaranNum(a.numero)))
  let pendientesStatus: CheckStatus = 'ok'
  let pendientesMessage = ''

  if (unreferencedAlbaranes.length > 0) {
    pendientesStatus = 'warning'
    hasWarnings = true
    pendientesMessage = `Existen albaranes no incluidos en la factura: ${unreferencedAlbaranes.map(a => a.numero).join(', ')}`
  } else if (albaranes.length > 0) {
    pendientesMessage = 'Todos los albaranes del expediente estan incluidos en la factura.'
  } else {
    pendientesStatus = 'skip'
    pendientesMessage = 'No hay albaranes en el expediente.'
  }

  // Resultado final
  let resultadoStatus: CheckStatus = 'ok'
  let resultadoText = 'MATCH INTERDOCUMENTAL CORRECTO'
  if (hasErrors) {
    resultadoStatus = 'error'
    resultadoText = 'MATCH CON ERRORES'
  } else if (hasWarnings) {
    resultadoStatus = 'warning'
    resultadoText = 'MATCH CON ADVERTENCIAS'
  }

  const borderColor = resultadoStatus === 'ok'
    ? 'border-green-300 dark:border-green-700'
    : resultadoStatus === 'error'
    ? 'border-red-300 dark:border-red-700'
    : 'border-amber-300 dark:border-amber-700'

  const iconBg = resultadoStatus === 'ok'
    ? 'bg-green-100 dark:bg-green-900/30'
    : resultadoStatus === 'error'
    ? 'bg-red-100 dark:bg-red-900/30'
    : 'bg-amber-100 dark:bg-amber-900/30'

  const iconColor = resultadoStatus === 'ok'
    ? 'text-green-600'
    : resultadoStatus === 'error'
    ? 'text-red-500'
    : 'text-amber-500'

  return (
    <Card className={`shadow-sm ${borderColor}`}>
      <CardHeader className="border-b px-6 py-5">
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-sm ${iconBg}`}>
            <Search className={`h-6 w-6 ${iconColor}`} />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">Validaciones Interdocumentales</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Cruce de datos entre {facturas.length} factura(s) y {albaranes.length} albaran(es)
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-8">

        {sections.map((s, si) => (
          <div key={si} className="space-y-6">

            {/* 1. Verificacion de referencias */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <span className="text-base">1.</span> Verificacion de referencias
              </h4>
              <div className="flex items-start gap-2.5 text-sm">
                <StatusIcon status={s.refStatus} />
                <div>
                  <p className={`font-medium ${statusColor(s.refStatus)}`}>{s.refMessage}</p>
                  {s.refDetail && <p className="text-xs text-muted-foreground mt-0.5">{s.refDetail}</p>}
                </div>
              </div>
            </div>

            {/* 2. Verificacion de importes por albaran */}
            {s.importeRows.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <span className="text-base">2.</span> Verificacion de importes por albaran
                </h4>
                <div className="overflow-x-auto rounded border border-border/50">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="py-1.5 px-3 text-xs">Albaran</TableHead>
                        <TableHead className="py-1.5 px-3 text-xs text-right">Base factura</TableHead>
                        <TableHead className="py-1.5 px-3 text-xs text-right">Base albaran</TableHead>
                        <TableHead className="py-1.5 px-3 text-xs text-center">Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.importeRows.map((row, ri) => (
                        <TableRow key={ri} className="text-xs">
                          <TableCell className="py-1.5 px-3 font-medium">{row.albaran}</TableCell>
                          <TableCell className="py-1.5 px-3 text-right whitespace-nowrap">{row.baseFactura}</TableCell>
                          <TableCell className="py-1.5 px-3 text-right whitespace-nowrap">{row.baseAlbaran}</TableCell>
                          <TableCell className="py-1.5 px-3 text-center">
                            <span className={`inline-flex items-center gap-1 ${statusColor(row.status)}`}>
                              <StatusIcon status={row.status} />
                              {row.status === 'ok' ? 'Coincide' : row.status === 'error' ? 'No coincide' : 'N/D'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-start gap-2.5 text-sm mt-2">
                  <StatusIcon status={s.allImportesMatch && s.hasImporteData ? 'ok' : s.hasImporteData ? 'error' : 'skip'} />
                  <p className={`font-medium ${statusColor(s.allImportesMatch && s.hasImporteData ? 'ok' : s.hasImporteData ? 'error' : 'skip')}`}>
                    {s.allImportesMatch && s.hasImporteData
                      ? 'Todos los importes individuales coinciden correctamente.'
                      : s.hasImporteData
                      ? 'Existen discrepancias en importes individuales.'
                      : 'Datos insuficientes para verificar importes.'}
                  </p>
                </div>
              </div>
            )}

            {/* 3. Verificacion de total acumulado */}
            {s.globalStatus !== 'skip' && (
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <span className="text-base">3.</span> Verificacion de total acumulado
                </h4>
                <div className="text-sm space-y-1 mb-2 text-muted-foreground">
                  <p>Suma bases albaranes: <span className="font-medium text-foreground">{s.globalSumaAlbaranes}</span></p>
                  <p>Base imponible total factura: <span className="font-medium text-foreground">{s.globalBaseFactura}</span></p>
                </div>
                <div className="flex items-start gap-2.5 text-sm">
                  <StatusIcon status={s.globalStatus} />
                  <p className={`font-medium ${statusColor(s.globalStatus)}`}>{s.globalMessage}</p>
                </div>
              </div>
            )}

          </div>
        ))}

        {/* 4. Comprobacion de albaranes pendientes */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <span className="text-base">4.</span> Comprobacion de albaranes pendientes
          </h4>
          <div className="flex items-start gap-2.5 text-sm">
            <StatusIcon status={pendientesStatus} />
            <p className={`font-medium ${statusColor(pendientesStatus)}`}>{pendientesMessage}</p>
          </div>
        </div>

        {/* Resultado final */}
        <div className={`rounded-lg p-4 flex items-center gap-3 ${
          resultadoStatus === 'ok' ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' :
          resultadoStatus === 'error' ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
          'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
        }`}>
          <ShieldCheck className={`h-5 w-5 shrink-0 ${iconColor}`} />
          <div>
            <p className="text-xs text-muted-foreground">Estado global</p>
            <p className={`font-bold text-sm ${statusColor(resultadoStatus)}`}>{resultadoText}</p>
          </div>
        </div>

      </CardContent>
    </Card>
  )
}
