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
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface FieldsTableProps {
  fields: Field[];
  extractedData?: Record<string, ExtractedField>;
  isExtracting: boolean;
  onAddCustomField?: (fieldName: string) => Promise<void>;
  isComplete?: boolean;
}

// --- Sub-table renderers ---

interface ConceptoFacturable {
  concepto: string;
  cantidad: string;
  precioUnitario: string;
  baseImponible: string;
  porcentajeIVA: string;
  importeIVA: string;
}

interface GrupoAlbaran {
  numAlbaran: string;
  fechaAlbaran: string;
  conceptos: ConceptoFacturable[];
}

interface DesgloseImpuesto {
  tipo: string;
  base: string;
  cuota: string;
}

interface DesgloseRetencion {
  tipo: string;
  base: string;
  cuota: string;
}

interface ConceptoEntregado {
  concepto: string;
  cantidadEntregada: string;
  precioUnitario: string;
  importeLinea: string;
}

function ConceptosFacturablesTable({ grupos }: { grupos: GrupoAlbaran[] }) {
  return (
    <div className="space-y-3">
      {grupos.map((grupo, gi) => (
        <div key={gi} className="space-y-1">
          {grupo.numAlbaran !== 'N/D' && (
            <div className="text-xs font-semibold text-foreground bg-muted/50 px-2 py-1 rounded">
              Albaran {grupo.numAlbaran} — {grupo.fechaAlbaran}
            </div>
          )}
          <div className="overflow-x-auto rounded border border-border/50">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="py-1.5 px-2 text-xs">Concepto</TableHead>
                  <TableHead className="py-1.5 px-2 text-xs text-right">Cant.</TableHead>
                  <TableHead className="py-1.5 px-2 text-xs text-right">P. Unit.</TableHead>
                  <TableHead className="py-1.5 px-2 text-xs text-right">Base Imp.</TableHead>
                  <TableHead className="py-1.5 px-2 text-xs text-right">% IVA</TableHead>
                  <TableHead className="py-1.5 px-2 text-xs text-right">IVA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupo.conceptos.map((c, ci) => (
                  <TableRow key={ci} className="text-xs">
                    <TableCell className="py-1.5 px-2 max-w-[200px] truncate">{c.concepto}</TableCell>
                    <TableCell className="py-1.5 px-2 text-right whitespace-nowrap">{c.cantidad}</TableCell>
                    <TableCell className="py-1.5 px-2 text-right whitespace-nowrap">{c.precioUnitario}</TableCell>
                    <TableCell className="py-1.5 px-2 text-right whitespace-nowrap">{c.baseImponible}</TableCell>
                    <TableCell className="py-1.5 px-2 text-right whitespace-nowrap">{c.porcentajeIVA}</TableCell>
                    <TableCell className="py-1.5 px-2 text-right whitespace-nowrap">{c.importeIVA}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}

function DesgloseImpuestoTable({ desglose }: { desglose: DesgloseImpuesto[] }) {
  return (
    <div className="overflow-x-auto rounded border border-border/50">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="py-1.5 px-2 text-xs">Tipo</TableHead>
            <TableHead className="py-1.5 px-2 text-xs text-right">Base</TableHead>
            <TableHead className="py-1.5 px-2 text-xs text-right">Cuota</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {desglose.map((d, i) => (
            <TableRow key={i} className="text-xs">
              <TableCell className="py-1.5 px-2">{d.tipo}</TableCell>
              <TableCell className="py-1.5 px-2 text-right whitespace-nowrap">{d.base}</TableCell>
              <TableCell className="py-1.5 px-2 text-right whitespace-nowrap">{d.cuota}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DesgloseRetencionTable({ retencion }: { retencion: DesgloseRetencion }) {
  return (
    <div className="overflow-x-auto rounded border border-border/50">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="py-1.5 px-2 text-xs">Tipo</TableHead>
            <TableHead className="py-1.5 px-2 text-xs text-right">Base</TableHead>
            <TableHead className="py-1.5 px-2 text-xs text-right">Cuota</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="text-xs">
            <TableCell className="py-1.5 px-2">{retencion.tipo}</TableCell>
            <TableCell className="py-1.5 px-2 text-right whitespace-nowrap">{retencion.base}</TableCell>
            <TableCell className="py-1.5 px-2 text-right whitespace-nowrap">{retencion.cuota}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function ConceptosEntregadosTable({ conceptos }: { conceptos: ConceptoEntregado[] }) {
  return (
    <div className="overflow-x-auto rounded border border-border/50">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="py-1.5 px-2 text-xs">Concepto</TableHead>
            <TableHead className="py-1.5 px-2 text-xs text-right">Cant.</TableHead>
            <TableHead className="py-1.5 px-2 text-xs text-right">P. Unit.</TableHead>
            <TableHead className="py-1.5 px-2 text-xs text-right">Importe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {conceptos.map((c, i) => (
            <TableRow key={i} className="text-xs">
              <TableCell className="py-1.5 px-2 max-w-[200px] truncate">{c.concepto}</TableCell>
              <TableCell className="py-1.5 px-2 text-right whitespace-nowrap">{c.cantidadEntregada}</TableCell>
              <TableCell className="py-1.5 px-2 text-right whitespace-nowrap">{c.precioUnitario}</TableCell>
              <TableCell className="py-1.5 px-2 text-right whitespace-nowrap">{c.importeLinea}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface ParteFirmante {
  nombreParte: string;
  cif: string;
  representante: string;
  cargoRepresentante: string;
  dniRepresentante: string;
}

function PartesFirmantesTable({ partes }: { partes: ParteFirmante[] }) {
  return (
    <div className="overflow-x-auto rounded border border-border/50">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="py-1.5 px-2 text-xs">Parte</TableHead>
            <TableHead className="py-1.5 px-2 text-xs">CIF</TableHead>
            <TableHead className="py-1.5 px-2 text-xs">Representante</TableHead>
            <TableHead className="py-1.5 px-2 text-xs">Cargo</TableHead>
            <TableHead className="py-1.5 px-2 text-xs">DNI</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {partes.map((parte, i) => (
            <TableRow key={i} className="text-xs">
              <TableCell className="py-1.5 px-2 font-medium">{parte.nombreParte}</TableCell>
              <TableCell className="py-1.5 px-2 whitespace-nowrap">{parte.cif}</TableCell>
              <TableCell className="py-1.5 px-2">{parte.representante}</TableCell>
              <TableCell className="py-1.5 px-2">{parte.cargoRepresentante}</TableCell>
              <TableCell className="py-1.5 px-2 whitespace-nowrap">{parte.dniRepresentante}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// --- Clausulas check/cross renderer ---

const CLAUSULA_FIELDS = [
  "Clausula Confidencialidad",
  "Clausula Proteccion Datos",
  "Clausula Propiedad Intelectual",
  "Clausula Cumplimiento Normativo",
  "Clausula Resolucion Anticipada",
];

function ClausulasSection({ extractedData }: { extractedData: Record<string, ExtractedField> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 py-1">
      {CLAUSULA_FIELDS.map((field) => {
        const value = extractedData[field]?.value?.toLowerCase() || '';
        const present = value === 'si' || value === 'yes';
        const label = field.replace('Clausula ', '');
        return (
          <div key={field} className="flex items-center gap-2 text-sm">
            {present ? (
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0" />
            )}
            <span className={present ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// --- Detalle Firmantes renderer ---

interface DetalleFirmante {
  nombre: string;
  enRepresentacionDe: string;
  cargo: string;
}

function DetalleFirmantesSection({ firmantes }: { firmantes: DetalleFirmante[] }) {
  return (
    <div className="overflow-x-auto rounded border border-border/50">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="py-1.5 px-2 text-xs">Firmante</TableHead>
            <TableHead className="py-1.5 px-2 text-xs">En representacion de</TableHead>
            <TableHead className="py-1.5 px-2 text-xs">Cargo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {firmantes.map((f, i) => (
            <TableRow key={i} className="text-xs">
              <TableCell className="py-1.5 px-2 font-medium">{f.nombre}</TableCell>
              <TableCell className="py-1.5 px-2">{f.enRepresentacionDe}</TableCell>
              <TableCell className="py-1.5 px-2">{f.cargo}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// --- JSON detection & sub-table routing ---

function tryParseJson(value: string): unknown | null {
  if (!value || value === 'N/D') return null;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
    return null;
  } catch {
    return null;
  }
}

function RichFieldValue({ fieldName, value }: { fieldName: string; value: string }) {
  // Style anonymized values in italic dark gray
  if (value && value.toLowerCase().includes('anonimizado en origen')) {
    return <span className="italic text-gray-500">{value}</span>;
  }

  const parsed = tryParseJson(value);
  if (!parsed) {
    // Long text fields: render with proper wrapping and line breaks
    if (value && value.length > 80) {
      return <span className="block whitespace-pre-line break-words leading-relaxed">{value}</span>;
    }
    return <span>{value}</span>;
  }

  const lower = fieldName.toLowerCase();

  // Conceptos Facturables (grouped by albaran)
  if (lower.includes('conceptos facturables') && Array.isArray(parsed)) {
    // Check if it's the grouped structure (has numAlbaran)
    if (parsed.length > 0 && 'numAlbaran' in parsed[0]) {
      return <ConceptosFacturablesTable grupos={parsed as GrupoAlbaran[]} />;
    }
    // Fallback: flat array of conceptos (wrap in single group)
    return <ConceptosFacturablesTable grupos={[{ numAlbaran: 'N/D', fechaAlbaran: 'N/D', conceptos: parsed as ConceptoFacturable[] }]} />;
  }

  // Desglose Impuesto Indirecto
  if (lower.includes('desglose impuesto') && Array.isArray(parsed)) {
    return <DesgloseImpuestoTable desglose={parsed as DesgloseImpuesto[]} />;
  }

  // Desglose Retencion (single object)
  if (lower.includes('desglose retencion') && !Array.isArray(parsed)) {
    return <DesgloseRetencionTable retencion={parsed as DesgloseRetencion} />;
  }

  // Conceptos Entregados (albaran)
  if (lower.includes('conceptos entregados') && Array.isArray(parsed)) {
    return <ConceptosEntregadosTable conceptos={parsed as ConceptoEntregado[]} />;
  }

  // Partes Firmantes (convenio)
  if (lower.includes('partes firmantes') && Array.isArray(parsed)) {
    return <PartesFirmantesTable partes={parsed as ParteFirmante[]} />;
  }

  // Detalle Firmantes (convenio)
  if (lower.includes('detalle firmantes') && Array.isArray(parsed)) {
    return <DetalleFirmantesSection firmantes={parsed as DetalleFirmante[]} />;
  }

  // Generic fallback: render as formatted JSON
  return <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(parsed, null, 2)}</pre>;
}

// --- Main Component ---

export function FieldsTable({ 
  fields, 
  extractedData, 
  isExtracting,
  onAddCustomField,
  isComplete = false,
}: FieldsTableProps) {
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

  // Detect if a field is a clausula boolean (rendered in grouped section)
  const isClausulaField = (fieldName: string) => {
    return CLAUSULA_FIELDS.includes(fieldName);
  };

  // Check if we have any clausula fields to render as a group
  const hasClausulaFields = fields.some(f => isClausulaField(f.name));
  const clausulaSectionRendered = { current: false };

  // Detect if a field has table-like content (JSON)
  const isTableField = (fieldName: string) => {
    const lower = fieldName.toLowerCase();
    return lower.includes('conceptos facturables') || 
           lower.includes('desglose impuesto') || 
           lower.includes('desglose retencion') ||
           lower.includes('conceptos entregados') ||
           lower.includes('partes firmantes') ||
           lower.includes('detalle firmantes');
  };

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/3">Campo</TableHead>
            <TableHead className="w-2/3">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field) => {
            const extracted = extractedData?.[field.name];
            const hasTableContent = extracted && isTableField(field.name) && tryParseJson(extracted.value);
            
            // Clausula fields: render once as a grouped section
            if (isClausulaField(field.name)) {
              if (clausulaSectionRendered.current) return null;
              clausulaSectionRendered.current = true;
              return extractedData ? (
                <TableRow key="clausulas-section" className="border-b">
                  <TableCell colSpan={2} className="p-0">
                    <div className="px-4 py-2 font-medium text-sm bg-muted/30 border-b border-border/50">
                      Deteccion de clausulas
                    </div>
                    <div className="px-4 py-3">
                      <ClausulasSection extractedData={extractedData} />
                    </div>
                  </TableCell>
                </TableRow>
              ) : null;
            }

            return hasTableContent ? (
              // Full-width row for table fields
              <TableRow key={field.name} className="border-b">
                <TableCell colSpan={2} className="p-0">
                  <div className="px-4 py-2 font-medium text-sm bg-muted/30 border-b border-border/50">
                    {field.name}
                  </div>
                  <div className="p-3">
                    {isExtracting && !extracted ? (
                      <Skeleton className="h-16 w-full" />
                    ) : (
                      <div className="animate-in fade-in duration-300">
                        <RichFieldValue fieldName={field.name} value={extracted.value} />
                      </div>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={field.name}>
                <TableCell className="font-medium">{field.name}</TableCell>
                <TableCell>
                  {isExtracting && !extracted ? (
                    <Skeleton className="h-5 w-full" />
                  ) : extracted ? (
                    <span className="animate-in fade-in duration-300">
                      <RichFieldValue fieldName={field.name} value={extracted.value} />
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
                      placeholder="Nombre del campo..."
                      disabled={isExtractingNewField}
                      autoFocus
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    {isExtractingNewField ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Extrayendo...</span>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleAddField}
                          disabled={!newFieldName.trim()}
                        >
                          Extraer
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setIsAddingField(false);
                            setNewFieldName('');
                          }}
                        >
                          Cancelar
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
                      Añadir campo personalizado
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
