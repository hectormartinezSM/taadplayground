// Utility functions for exporting workflow data

import { Page, Document, ActivityLogEntry } from './types';

export interface ExportData {
  documents: Array<{
    documentId: string;
    type: string;
    pageNumbers: number[];
    fields: Record<string, string>;
  }>;
}

export function prepareExportData(
  pages: Page[],
  documents: Document[],
  activityLog: ActivityLogEntry[]
) {
  return {
    documents: documents.map(doc => {
      const docPages = pages.filter(p => doc.pageIds.includes(p.id));
      const extractedFields: Record<string, string> = {};
      
      // Remove confidence from extracted fields
      if (doc.extractedData) {
        Object.entries(doc.extractedData).forEach(([key, value]) => {
          extractedFields[key] = value.value;
        });
      }
      
      return {
        documentId: doc.id,
        type: doc.documentType?.type || 'Unknown',
        pageNumbers: docPages.map(p => p.index + 1),
        fields: extractedFields,
      };
    }),
  };
}

export function downloadJSON(data: any) {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `workflow-export-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCSV(data: any) {
  const rows: string[][] = [];
  
  // Header row
  rows.push([
    'Document ID',
    'Document Type',
    'Pages',
    'Field',
    'Value',
  ]);

  // Data rows
  data.documents.forEach((doc: any) => {
    if (doc.fields && Object.keys(doc.fields).length > 0) {
      Object.entries(doc.fields).forEach(([fieldName, fieldValue]) => {
        const pageRange = doc.pageNumbers.length === 1 
          ? `'${doc.pageNumbers[0]}`
          : `'${doc.pageNumbers[0]}-${doc.pageNumbers[doc.pageNumbers.length - 1]}`;
        // </CHANGE>
        
        rows.push([
          doc.documentId,
          doc.type,
          pageRange,
          fieldName,
          String(fieldValue),
        ]);
      });
    } else {
      const pageRange = doc.pageNumbers.length === 1 
        ? `'${doc.pageNumbers[0]}`
        : `'${doc.pageNumbers[0]}-${doc.pageNumbers[doc.pageNumbers.length - 1]}`;
      // </CHANGE>
      
      rows.push([
        doc.documentId,
        doc.type,
        pageRange,
        'N/A',
        'N/A',
      ]);
    }
  });

  const csvString = rows
    .map(row => row.join(';'))
    .join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `workflow-export-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadDocumentJSON(doc: any, index: number) {
  const data = { documents: [doc] };
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `document-${index + 1}-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadDocumentCSV(doc: any, index: number) {
  const rows: string[][] = [];
  
  // Header row
  rows.push([
    'Document ID',
    'Document Type',
    'Pages',
    'Field',
    'Value',
  ]);

  // Data rows
  if (doc.fields && Object.keys(doc.fields).length > 0) {
    Object.entries(doc.fields).forEach(([fieldName, fieldValue]) => {
      const pageRange = doc.pageNumbers.length === 1 
        ? `'${doc.pageNumbers[0]}`
        : `'${doc.pageNumbers[0]}-${doc.pageNumbers[doc.pageNumbers.length - 1]}`;
      // </CHANGE>
      
      rows.push([
        doc.documentId,
        doc.type,
        pageRange,
        fieldName,
        String(fieldValue),
      ]);
    });
  }

  const csvString = rows
    .map(row => row.join(';'))
    .join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `document-${index + 1}-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
