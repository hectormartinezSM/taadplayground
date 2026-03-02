"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Cotejo, CotejoChecklistItem } from "@/lib/types"
import { CheckCircle2, AlertTriangle, XCircle, FileStack, Check, X } from "lucide-react"

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
        return "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
      case "WARNING":
        return "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800"
      case "ERROR":
        return "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
      default:
        return "bg-muted"
    }
  }

  const getSeverityTextColor = (severidad: string) => {
    switch (severidad) {
      case "OK":
        return "text-green-800 dark:text-green-200"
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

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="border-b px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shadow-sm">
              <FileStack className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-lg font-semibold">
              Análisis de coherencia del expediente
            </CardTitle>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {okCount > 0 && (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                {okCount}
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-yellow-600">
                <AlertTriangle className="h-4 w-4" />
                {warningCount}
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <XCircle className="h-4 w-4" />
                {errorCount}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
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
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
