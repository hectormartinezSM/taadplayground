"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Clock, ChevronRight, Loader2 } from "lucide-react"
import type { Submission } from "@/lib/submissions"

interface SubmissionHistoryProps {
  onViewSubmission?: (submission: Submission) => void
}

export function SubmissionHistory({ onViewSubmission }: SubmissionHistoryProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSubmissions() {
      try {
        const response = await fetch('/api/submissions?limit=10')
        if (!response.ok) throw new Error('Failed to fetch')
        const data = await response.json()
        setSubmissions(data.submissions || [])
      } catch (err) {
        console.error('[v0] Error loading submissions:', err)
        setError('No se pudieron cargar los envíos anteriores')
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchSubmissions()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return null // Don't show error, just hide the section
  }

  if (submissions.length === 0) {
    return null // Don't show if no submissions
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  return (
    <div className="mt-8 pt-8 border-t">
      <div className="text-center mb-4">
        <h3 className="text-base font-semibold text-foreground mb-1">Envíos recientes</h3>
        <p className="text-sm text-muted-foreground">Consulta los documentos procesados anteriormente</p>
      </div>

      <div className="space-y-3 max-w-2xl mx-auto">
        {submissions.slice(0, 5).map((submission) => (
          <Card
            key={submission.id}
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group"
            onClick={() => onViewSubmission?.(submission)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-muted rounded-lg p-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-medium text-sm text-foreground">
                      {submission.documents.length} documento{submission.documents.length !== 1 ? 's' : ''} procesado{submission.documents.length !== 1 ? 's' : ''}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDate(submission.createdAt)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground">
                    {submission.documents.map(d => d.type).join(', ')}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
