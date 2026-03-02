"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Cotejo, CotejoDetalle } from "@/lib/types"
import { CheckCircle2, AlertTriangle, XCircle, ClipboardCheck, Check, X } from "lucide-react"

interface CotejosInterdocumentalesProps {
  cotejos: Cotejo[]
}

export function CotejosInterdocumentales({ cotejos }: CotejosInterdocumentalesProps) {
  if (!cotejos || cotejos.length === 0) {
    return null
  }

  const getSeverityIcon = (severidad: string) => {
    switch (severidad) {
      case "OK":
        return <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
      case "WARNING":
        return <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
      case "ERROR":
        return <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
      default:
        return null
    }
  }

  const getSeverityBgColor = (severidad: string) => {
    switch (severidad) {
      case "OK":
        // Neutral background for OK - analytical style
        return "bg-background border-border"
      case "WARNING":
        return "bg-yellow-50/50 dark:bg-yellow-950/10 border-yellow-200/60 dark:border-yellow-800/40"
      case "ERROR":
        return "bg-red-50/50 dark:bg-red-950/10 border-red-200/60 dark:border-red-800/40"
      default:
        return "bg-muted/50"
    }
  }

  const getSeverityTextColor = (severidad: string) => {
    switch (severidad) {
      case "OK":
        // Neutral text for OK - analytical style
        return "text-foreground"
      case "WARNING":
        return "text-yellow-800 dark:text-yellow-200"
      case "ERROR":
        return "text-red-800 dark:text-red-200"
      default:
        return "text-foreground"
    }
  }

  // Count by severity
  const okCount = cotejos.filter(c => c.severidad === "OK").length
  const warningCount = cotejos.filter(c => c.severidad === "WARNING").length
  const errorCount = cotejos.filter(c => c.severidad === "ERROR").length

  // Summary message
  const getSummaryMessage = () => {
    if (errorCount > 0) {
      return "Se detectan incoherencias que requieren revisión."
    }
    if (warningCount > 0) {
      return "Se detectan incidencias leves."
    }
    return "No se detectan incoherencias relevantes."
  }

  return (
    <>
      {/* Visual separator */}
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-muted-foreground/20" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-4 text-xs uppercase tracking-wider text-muted-foreground">
            Análisis del expediente
          </span>
        </div>
      </div>

      <Card className="border-dashed border-2 border-muted-foreground/20 bg-muted/30">
        <CardHeader className="px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 shadow-sm">
                <ClipboardCheck className="h-6 w-6 text-slate-600 dark:text-slate-300" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">
                  Análisis de coherencia del expediente
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {getSummaryMessage()}
                </p>
              </div>
            </div>
          </div>
        </CardHeader>

        {/* Summary bar */}
        <div className="px-6 pb-4">
          <div className="flex items-center gap-4 text-sm bg-background/80 rounded-lg px-4 py-2.5 border">
            <span className="text-muted-foreground font-medium">Resumen:</span>
            <span className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              {okCount} OK
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="flex items-center gap-1.5 text-yellow-600">
              <AlertTriangle className="h-4 w-4" />
              {warningCount} WARNING
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="flex items-center gap-1.5 text-red-600">
              <XCircle className="h-4 w-4" />
              {errorCount} ERROR
            </span>
          </div>
        </div>

        <CardContent className="space-y-3 pt-0">
        {cotejos.map((cotejo) => (
          <div
            key={cotejo.id}
            className={`flex items-start gap-3 rounded-lg border p-4 ${getSeverityBgColor(cotejo.severidad)}`}
          >
            {getSeverityIcon(cotejo.severidad)}
            <div className="flex-1 min-w-0">
              <span className={`font-medium text-sm ${getSeverityTextColor(cotejo.severidad)}`}>
                {cotejo.titulo}
              </span>
              <p className={`text-sm mt-0.5 ${getSeverityTextColor(cotejo.severidad)} opacity-90`}>
                {cotejo.mensaje}
              </p>
              {/* Render checklist if present */}
              {cotejo.checklist && cotejo.checklist.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {cotejo.checklist.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm">
                      {item.checked ? (
                        <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className={item.checked ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}>
                        {item.label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {/* Render detalle if present */}
              {cotejo.detalle && cotejo.detalle.length > 0 && (
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {cotejo.detalle.map((item, idx) => (
                    <div key={idx} className="contents">
                      <dt className="text-muted-foreground">{item.label}:</dt>
                      <dd className="font-medium">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        ))}
      </CardContent>
      </Card>
    </>
  )
}
