'use client';

import { ActivityLogEntry } from '@/lib/types';
import { FileX, FileText, Tag, List, FileCheck } from 'lucide-react';

interface ActivityLogProps {
  entries: ActivityLogEntry[];
}

const iconMap = {
  page_discarded: FileX,
  document_created: FileText,
  document_classified: Tag,
  fields_detected: List,
  field_extracted: FileCheck,
};

const colorMap = {
  page_discarded: 'text-orange-600',
  document_created: 'text-amber-500',
  document_classified: 'text-purple-600',
  fields_detected: 'text-green-600',
  field_extracted: 'text-teal-600',
};

export default function ActivityLog({ entries }: ActivityLogProps) {
  return (
    <div>
      <div className="space-y-3">
        {entries.map((entry) => {
          const Icon = iconMap[entry.type as keyof typeof iconMap];
          const colorClass = colorMap[entry.type as keyof typeof colorMap];
          
          if (!Icon) return null;
          
          return (
            <div
              key={entry.id}
              className="animate-in fade-in slide-in-from-top-2 duration-300"
            >
              <div className="flex gap-2">
                <div className={`flex-shrink-0 pt-0.5 ${colorClass}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 space-y-0.5">
                  <p className="text-xs text-foreground leading-relaxed">
                    {entry.message}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {entry.timestamp.toLocaleTimeString('es-ES')}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { ActivityLog };
