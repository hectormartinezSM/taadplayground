'use client';

import { useState } from 'react';
import { Field, ExtractedField } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { useLocale } from '@/lib/locale-context';

interface FieldsTableProps {
  fields: Field[];
  extractedData?: Record<string, ExtractedField>;
  isExtracting: boolean;
  onAddCustomField?: (fieldName: string) => Promise<void>;
  isComplete?: boolean;
}

export function FieldsTable({ 
  fields, 
  extractedData, 
  isExtracting,
  onAddCustomField,
  isComplete = false,
}: FieldsTableProps) {
  const { t } = useLocale();
  const [isAddingField, setIsAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [isExtractingNewField, setIsExtractingNewField] = useState(false);

  const handleAddField = async () => {
    if (!newFieldName.trim() || !onAddCustomField) return;

    setIsExtractingNewField(true);
    try {
      await onAddCustomField(newFieldName.trim());
      setNewFieldName('');
      setIsAddingField(false);
    } catch (error) {
      console.error('[v0] Error adding custom field:', error);
    } finally {
      setIsExtractingNewField(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddField();
    }
  };

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/3">{t("Campo", "Field")}</TableHead>
            <TableHead className="w-2/3">{t("Valor", "Value")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field) => {
            const extracted = extractedData?.[field.name];
            
            return (
              <TableRow key={field.name}>
                <TableCell className="font-medium">{field.name}</TableCell>
                <TableCell>
                  {isExtracting && !extracted ? (
                    <Skeleton className="h-5 w-full" />
                  ) : extracted ? (
                    <span className="animate-in fade-in duration-300">
                      {extracted.value}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
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
                      placeholder={t("Nombre del campo...", "Field name...")}
                      disabled={isExtractingNewField}
                      autoFocus
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    {isExtractingNewField ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t("Extrayendo...", "Extracting...")}</span>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleAddField}
                          disabled={!newFieldName.trim()}
                        >
                          {t("Extraer", "Extract")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setIsAddingField(false);
                            setNewFieldName('');
                          }}
                        >
                          {t("Cancelar", "Cancel")}
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
                      {t("Añadir campo personalizado", "Add custom field")}
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
