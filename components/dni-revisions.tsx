"use client"

import type { DNIRevision } from "@/lib/types"
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react"

interface DNIRevisionsProps {
  revisiones: DNIRevision[]
}

function getSeverityIcon(severidad: DNIRevision["severidad"]) {
  switch (severidad) {
    case "OK":
      return <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
    case "WARNING":
      return <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
    case "ERROR":
      return <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
  }
}

function getSeverityBgColor(severidad: DNIRevision["severidad"]) {
  switch (severidad) {
    case "OK":
      return "bg-green-50 border-green-200"
    case "WARNING":
      return "bg-amber-50 border-amber-200"
    case "ERROR":
      return "bg-red-50 border-red-200"
  }
}

function getSeverityTextColor(severidad: DNIRevision["severidad"]) {
  switch (severidad) {
    case "OK":
      return "text-green-800"
    case "WARNING":
      return "text-amber-800"
    case "ERROR":
      return "text-red-800"
  }
}

export function DNIRevisions({ revisiones }: DNIRevisionsProps) {
  // Count by severity
  const counts = {
    OK: revisiones.filter((r) => r.severidad === "OK").length,
    WARNING: revisiones.filter((r) => r.severidad === "WARNING").length,
    ERROR: revisiones.filter((r) => r.severidad === "ERROR").length,
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm">
        <span className="font-medium text-foreground">Resumen:</span>
        <div className="flex items-center gap-1">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-green-700">{counts.OK}</span>
        </div>
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-amber-700">{counts.WARNING}</span>
        </div>
        <div className="flex items-center gap-1">
          <XCircle className="h-4 w-4 text-red-600" />
          <span className="text-red-700">{counts.ERROR}</span>
        </div>
      </div>

      {/* Revisions list */}
      <div className="space-y-2">
        {revisiones.map((revision) => (
          <div
            key={revision.id}
            className={`flex items-start gap-3 p-3 rounded-lg border ${getSeverityBgColor(revision.severidad)}`}
          >
            {getSeverityIcon(revision.severidad)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`font-medium text-sm ${getSeverityTextColor(revision.severidad)}`}>
                  {revision.titulo}
                </span>
                <span className="text-xs text-muted-foreground">({revision.id})</span>
              </div>
              <p className={`text-sm mt-0.5 ${getSeverityTextColor(revision.severidad)} opacity-90`}>
                {revision.mensaje}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
