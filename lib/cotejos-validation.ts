import type { Document, Cotejo, CotejoChecklistItem } from "./types"

// Helper to get document type
function getDocumentType(doc: Document): string {
  return doc.documentType?.type?.toLowerCase() || ""
}

// Helper to check if document is of certain type
function isDNI(doc: Document): boolean {
  const type = getDocumentType(doc)
  return type.includes("dni") || type.includes("documento nacional")
}

function isNomina(doc: Document): boolean {
  const type = getDocumentType(doc)
  return type.includes("nómina") || type.includes("nomina")
}

function isVidaLaboral(doc: Document): boolean {
  const type = getDocumentType(doc)
  return type.includes("vida laboral")
}

function isContrato(doc: Document): boolean {
  const type = getDocumentType(doc)
  return type.includes("contrato")
}

function isNotaSimple(doc: Document): boolean {
  const type = getDocumentType(doc)
  return type.includes("nota simple")
}

function isModelo100(doc: Document): boolean {
  const type = getDocumentType(doc)
  return type.includes("modelo 100") || type.includes("irpf") || type.includes("declaración de irpf")
}

// Helper to parse amount in Spanish format
function parseAmount(amountStr: string): number | null {
  if (!amountStr || amountStr === "N/D" || amountStr === "N/A") return null
  
  // Remove currency symbols and normalize
  let normalized = amountStr.replace(/[€EUR\s]/gi, "").trim()
  
  // Handle Spanish format: 1.234,56 -> 1234.56
  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".")
  }
  
  const value = parseFloat(normalized)
  return isNaN(value) ? null : value
}

// Helper to parse Spanish date
function parseSpanishDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === "N/D" || dateStr === "N/A") return null
  
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) {
    const [, day, month, year] = match
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  }
  return null
}

// DOC1: Control de tipos documentales presentados
export function validateDocumentosPresentados(documents: Document[]): Cotejo {
  const hasDNI = documents.some(isDNI)
  const nominas = documents.filter(isNomina)
  const hasThreeNominas = nominas.length >= 3
  const hasVidaLaboral = documents.some(isVidaLaboral)
  const hasContrato = documents.some(isContrato)
  const hasVidaLaboralOrContrato = hasVidaLaboral || hasContrato
  const hasNotaSimple = documents.some(isNotaSimple)
  const hasModelo100 = documents.some(isModelo100)
  
  // Build checklist
  const checklist = [
    { label: "DNI", checked: hasDNI },
    { label: "Tres nóminas", checked: hasThreeNominas },
    { label: "Vida laboral o contrato laboral", checked: hasVidaLaboralOrContrato },
    { label: "Declaración de la renta", checked: hasModelo100 },
    { label: "Nota Simple", checked: hasNotaSimple },
  ]
  
  const allChecked = checklist.every(item => item.checked)
  const checkedCount = checklist.filter(item => item.checked).length
  
  if (allChecked) {
    return {
      id: "DOC1",
      titulo: "Control de tipos documentales",
      severidad: "OK",
      mensaje: "Expediente documental completo",
      checklist
    }
  }
  
  return {
    id: "DOC1",
    titulo: "Control de tipos documentales",
    severidad: "ERROR",
    mensaje: `Expediente incompleto (${checkedCount}/${checklist.length})`,
    checklist
  }
}

// ID1: DNI consistente entre documentos
export function validateDNIConsistente(documents: Document[]): Cotejo {
  const dniValues: { source: string; dni: string }[] = []
  
  // Get DNI from DNI document
  const dniDoc = documents.find(isDNI)
  if (dniDoc?.extractedData?.["DNI"]) {
    const dniValue = dniDoc.extractedData["DNI"].value
    if (dniValue && dniValue !== "N/D") {
      dniValues.push({ source: "DNI", dni: dniValue.toUpperCase().replace(/[\s\-]/g, "") })
    }
  }
  
  // Get DNI from all nóminas
  const nominas = documents.filter(isNomina)
  for (const nomina of nominas) {
    if (nomina.extractedData?.["DNI"]) {
      const dniValue = nomina.extractedData["DNI"].value
      if (dniValue && dniValue !== "N/D") {
        dniValues.push({ source: "Nómina", dni: dniValue.toUpperCase().replace(/[\s\-]/g, "") })
      }
    }
  }
  
  // Get DNI from Vida Laboral
  const vidaLaboral = documents.find(isVidaLaboral)
  if (vidaLaboral?.extractedData?.["DNI"]) {
    const dniValue = vidaLaboral.extractedData["DNI"].value
    if (dniValue && dniValue !== "N/D") {
      dniValues.push({ source: "Vida Laboral", dni: dniValue.toUpperCase().replace(/[\s\-]/g, "") })
    }
  }
  
  // Get NIF from Modelo 100
  const modelo100 = documents.find(isModelo100)
  if (modelo100?.extractedData?.["NIF"]) {
    const nifValue = modelo100.extractedData["NIF"].value
    if (nifValue && nifValue !== "N/D") {
      dniValues.push({ source: "Modelo 100", dni: nifValue.toUpperCase().replace(/[\s\-]/g, "") })
    }
  }
  
  if (dniValues.length === 0) {
    return {
      id: "ID1",
      titulo: "DNI consistente",
      severidad: "ERROR",
      mensaje: "No se encontró DNI en ningún documento"
    }
  }
  
  // Check if all DNIs are the same
  const uniqueDNIs = [...new Set(dniValues.map(d => d.dni))]
  
  if (uniqueDNIs.length === 1) {
    return {
      id: "ID1",
      titulo: "DNI consistente",
      severidad: "OK",
      mensaje: `DNI consistente en todos los documentos (${uniqueDNIs[0]})`
    }
  }
  
  // Find which documents have different DNIs
  const dniGroups = new Map<string, string[]>()
  for (const { source, dni } of dniValues) {
    if (!dniGroups.has(dni)) {
      dniGroups.set(dni, [])
    }
    dniGroups.get(dni)!.push(source)
  }
  
  const differences = Array.from(dniGroups.entries())
    .map(([dni, sources]) => `${dni} (${sources.join(", ")})`)
    .join(" vs ")
  
  return {
    id: "ID1",
    titulo: "DNI consistente",
    severidad: "ERROR",
    mensaje: `Inconsistencia de DNI entre documentos: ${differences}`
  }
}

// EMP1: Empresa nómina = Empresa vigente
export function validateEmpresaCoherente(documents: Document[]): Cotejo {
  // Get the most recent nómina
  const nominas = documents.filter(isNomina)
  
  if (nominas.length === 0) {
    return {
      id: "EMP1",
      titulo: "Empresa coherente",
      severidad: "ERROR",
      mensaje: "No se encontraron nóminas para comparar"
    }
  }
  
  // Sort by period to get the most recent
  const sortedNominas = [...nominas].sort((a, b) => {
    const periodoA = a.extractedData?.["Periodo"]?.value || ""
    const periodoB = b.extractedData?.["Periodo"]?.value || ""
    // Extract end date from period for comparison
    const matchA = periodoA.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/)
    const matchB = periodoB.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/)
    const dateA = matchA ? parseSpanishDate(matchA[2]) : null
    const dateB = matchB ? parseSpanishDate(matchB[2]) : null
    if (!dateA && !dateB) return 0
    if (!dateA) return 1
    if (!dateB) return -1
    return dateB.getTime() - dateA.getTime()
  })
  
  const mostRecentNomina = sortedNominas[0]
  const empresaNomina = mostRecentNomina.extractedData?.["Nombre empresa"]?.value || ""
  
  if (!empresaNomina || empresaNomina === "N/D") {
    return {
      id: "EMP1",
      titulo: "Empresa coherente",
      severidad: "ERROR",
      mensaje: "No se encontró nombre de empresa en la nómina"
    }
  }
  
  // Check Vida Laboral for current employer
  const vidaLaboral = documents.find(isVidaLaboral)
  
  if (vidaLaboral) {
    // Parse situaciones from Vida Laboral
    const situacionesJson = vidaLaboral.extractedData?.["Situaciones"]?.value || "[]"
    try {
      const situaciones = JSON.parse(situacionesJson)
      
      // Find the current employer (fechaBaja = "---" or empty)
      const empleoVigente = situaciones.find((s: { fechaBaja?: string }) => 
        !s.fechaBaja || s.fechaBaja === "---" || s.fechaBaja === "N/D" || s.fechaBaja === ""
      )
      
      if (empleoVigente && empleoVigente.empresa) {
        const empresaVida = empleoVigente.empresa
        
        // Compare (case insensitive, removing extra spaces)
        const normalizeEmpresa = (str: string) => str.toLowerCase().replace(/\s+/g, " ").trim()
        
        if (normalizeEmpresa(empresaNomina).includes(normalizeEmpresa(empresaVida)) ||
            normalizeEmpresa(empresaVida).includes(normalizeEmpresa(empresaNomina))) {
          return {
            id: "EMP1",
            titulo: "Empresa coherente",
            severidad: "OK",
            mensaje: `Empresa coherente entre nómina y vida laboral (${empresaNomina})`
          }
        }
        
        return {
          id: "EMP1",
          titulo: "Empresa coherente",
          severidad: "ERROR",
          mensaje: `Empresa de nómina no coincide con empleo vigente. Nómina: ${empresaNomina}, Vida Laboral: ${empresaVida}`
        }
      }
    } catch {
      // Continue to check contrato
    }
  }
  
  // If no Vida Laboral, check Contrato
  const contrato = documents.find(isContrato)
  
  if (contrato) {
    const empresaContrato = contrato.extractedData?.["Nombre empresa"]?.value || 
                            contrato.extractedData?.["Empresa"]?.value || ""
    
    if (empresaContrato && empresaContrato !== "N/D") {
      const normalizeEmpresa = (str: string) => str.toLowerCase().replace(/\s+/g, " ").trim()
      
      if (normalizeEmpresa(empresaNomina).includes(normalizeEmpresa(empresaContrato)) ||
          normalizeEmpresa(empresaContrato).includes(normalizeEmpresa(empresaNomina))) {
        return {
          id: "EMP1",
          titulo: "Empresa coherente",
          severidad: "OK",
          mensaje: `Empresa coherente entre nómina y contrato (${empresaNomina})`
        }
      }
      
      return {
        id: "EMP1",
        titulo: "Empresa coherente",
        severidad: "ERROR",
        mensaje: `Empresa de nómina no coincide con contrato. Nómina: ${empresaNomina}, Contrato: ${empresaContrato}`
      }
    }
  }
  
  return {
    id: "EMP1",
    titulo: "Empresa coherente",
    severidad: "ERROR",
    mensaje: "No se encontró Vida Laboral ni Contrato para comparar empresa"
  }
}

// EMP2: Antigüedad coherente
export function validateAntiguedadCoherente(documents: Document[]): Cotejo {
  // Get antigüedad from most recent nómina
  const nominas = documents.filter(isNomina)
  
  if (nominas.length === 0) {
    return {
      id: "EMP2",
      titulo: "Antigüedad coherente",
      severidad: "ERROR",
      mensaje: "No se encontraron nóminas para comparar antigüedad"
    }
  }
  
  // Sort by period to get the most recent
  const sortedNominas = [...nominas].sort((a, b) => {
    const periodoA = a.extractedData?.["Periodo"]?.value || ""
    const periodoB = b.extractedData?.["Periodo"]?.value || ""
    const matchA = periodoA.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/)
    const matchB = periodoB.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/)
    const dateA = matchA ? parseSpanishDate(matchA[2]) : null
    const dateB = matchB ? parseSpanishDate(matchB[2]) : null
    if (!dateA && !dateB) return 0
    if (!dateA) return 1
    if (!dateB) return -1
    return dateB.getTime() - dateA.getTime()
  })
  
  const mostRecentNomina = sortedNominas[0]
  const antiguedadNomina = mostRecentNomina.extractedData?.["Fecha antigüedad"]?.value || ""
  
  if (!antiguedadNomina || antiguedadNomina === "N/D") {
    return {
      id: "EMP2",
      titulo: "Antigüedad coherente",
      severidad: "ERROR",
      mensaje: "No se encontró fecha de antigüedad en la nómina"
    }
  }
  
  const fechaAntiguedadNomina = parseSpanishDate(antiguedadNomina)
  
  if (!fechaAntiguedadNomina) {
    return {
      id: "EMP2",
      titulo: "Antigüedad coherente",
      severidad: "ERROR",
      mensaje: "No se pudo parsear la fecha de antigüedad de la nómina"
    }
  }
  
  // Get fecha alta from Vida Laboral
  const vidaLaboral = documents.find(isVidaLaboral)
  
  if (vidaLaboral) {
    const situacionesJson = vidaLaboral.extractedData?.["Situaciones"]?.value || "[]"
    try {
      const situaciones = JSON.parse(situacionesJson)
      
      // Find the current employer
      const empleoVigente = situaciones.find((s: { fechaBaja?: string }) => 
        !s.fechaBaja || s.fechaBaja === "---" || s.fechaBaja === "N/D" || s.fechaBaja === ""
      )
      
      if (empleoVigente && empleoVigente.fechaAlta) {
        const fechaAltaVida = parseSpanishDate(empleoVigente.fechaAlta)
        
        if (fechaAltaVida) {
          // Calculate difference in days
          const diffTime = Math.abs(fechaAntiguedadNomina.getTime() - fechaAltaVida.getTime())
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
          
          if (diffDays <= 30) {
            return {
              id: "EMP2",
              titulo: "Antigüedad coherente",
              severidad: "OK",
              mensaje: `Antigüedad coherente entre documentos (diferencia: ${diffDays} días)`
            }
          }
          
          if (diffDays <= 90) {
            return {
              id: "EMP2",
              titulo: "Antigüedad coherente",
              severidad: "WARNING",
              mensaje: `Antigüedad presenta ligera discrepancia (diferencia: ${diffDays} días). Nómina: ${antiguedadNomina}, Vida Laboral: ${empleoVigente.fechaAlta}`
            }
          }
          
          return {
            id: "EMP2",
            titulo: "Antigüedad coherente",
            severidad: "ERROR",
            mensaje: `Antigüedad incoherente entre documentos (diferencia: ${diffDays} días). Nómina: ${antiguedadNomina}, Vida Laboral: ${empleoVigente.fechaAlta}`
          }
        }
      }
    } catch {
      // Continue
    }
  }
  
  return {
    id: "EMP2",
    titulo: "Antigüedad coherente",
    severidad: "WARNING",
    mensaje: "No se pudo comparar antigüedad con Vida Laboral"
  }
}

// ING1: Coherencia anual de ingresos
export function validateIngresosCoherentes(documents: Document[]): Cotejo {
  // Get the 3 most recent nóminas
  const nominas = documents.filter(isNomina)
  
  if (nominas.length < 3) {
    return {
      id: "ING1",
      titulo: "Coherencia de ingresos",
      severidad: "ERROR",
      mensaje: `Se requieren al menos 3 nóminas para calcular la coherencia de ingresos (hay ${nominas.length})`
    }
  }
  
  // Sort by period to get the most recent
  const sortedNominas = [...nominas].sort((a, b) => {
    const periodoA = a.extractedData?.["Periodo"]?.value || ""
    const periodoB = b.extractedData?.["Periodo"]?.value || ""
    const matchA = periodoA.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/)
    const matchB = periodoB.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/)
    const dateA = matchA ? parseSpanishDate(matchA[2]) : null
    const dateB = matchB ? parseSpanishDate(matchB[2]) : null
    if (!dateA && !dateB) return 0
    if (!dateA) return 1
    if (!dateB) return -1
    return dateB.getTime() - dateA.getTime()
  })
  
  // Get the 3 most recent nóminas
  const recentNominas = sortedNominas.slice(0, 3)
  
  // Calculate average of "Líquido a percibir"
  const liquidoValues: number[] = []
  for (const nomina of recentNominas) {
    const liquido = nomina.extractedData?.["Líquido a percibir"]?.value || ""
    const value = parseAmount(liquido)
    if (value !== null) {
      liquidoValues.push(value)
    }
  }
  
  if (liquidoValues.length < 3) {
    return {
      id: "ING1",
      titulo: "Coherencia de ingresos",
      severidad: "ERROR",
      mensaje: "No se encontró el líquido a percibir en todas las nóminas"
    }
  }
  
  const promedioNeto = liquidoValues.reduce((sum, v) => sum + v, 0) / liquidoValues.length
  const estimacionAnual = promedioNeto * 12
  
  // Get Rendimiento del trabajo from Modelo 100
  const modelo100 = documents.find(isModelo100)
  
  if (!modelo100) {
    return {
      id: "ING1",
      titulo: "Coherencia de ingresos",
      severidad: "ERROR",
      mensaje: "No se encontró Modelo 100 para comparar ingresos"
    }
  }
  
  const rendimientoTrabajo = modelo100.extractedData?.["Rendimiento del trabajo"]?.value || ""
  const rendimientoValue = parseAmount(rendimientoTrabajo)
  
  if (rendimientoValue === null || rendimientoValue === 0) {
    return {
      id: "ING1",
      titulo: "Coherencia de ingresos",
      severidad: "ERROR",
      mensaje: "No se encontró el Rendimiento del trabajo en el Modelo 100"
    }
  }
  
  // Calculate percentage difference
  const diferencia = Math.abs(estimacionAnual - rendimientoValue) / rendimientoValue
  
  // Format amounts for message
  const formatAmount = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€"
  
  if (diferencia <= 0.20) {
    return {
      id: "ING1",
      titulo: "Coherencia de ingresos",
      severidad: "OK",
      mensaje: `Ingresos coherentes entre nóminas y declaración. Estimación anual: ${formatAmount(estimacionAnual)}, IRPF: ${formatAmount(rendimientoValue)} (${(diferencia * 100).toFixed(1)}% diferencia)`
    }
  }
  
  if (diferencia <= 0.40) {
    return {
      id: "ING1",
      titulo: "Coherencia de ingresos",
      severidad: "WARNING",
      mensaje: `Ingresos presentan desviación significativa. Estimación anual: ${formatAmount(estimacionAnual)}, IRPF: ${formatAmount(rendimientoValue)} (${(diferencia * 100).toFixed(1)}% diferencia)`
    }
  }
  
  return {
    id: "ING1",
    titulo: "Coherencia de ingresos",
    severidad: "ERROR",
    mensaje: `Ingresos incoherentes entre nóminas y declaración. Estimación anual: ${formatAmount(estimacionAnual)}, IRPF: ${formatAmount(rendimientoValue)} (${(diferencia * 100).toFixed(1)}% diferencia)`
  }
}

// Main function to run all cross-document validations
export function runCotejosInterdocumentales(documents: Document[]): Cotejo[] {
  const cotejos: Cotejo[] = []
  
  // Only run if there are multiple documents
  if (documents.length < 2) {
    return []
  }
  
  // Only run if all documents are complete
  const allComplete = documents.every(doc => doc.status === "complete")
  if (!allComplete) {
    return []
  }
  
  // DOC1: Control de tipos documentales
  cotejos.push(validateDocumentosPresentados(documents))
  
  // ID1: DNI consistente
  cotejos.push(validateDNIConsistente(documents))
  
  // EMP1: Empresa coherente
  cotejos.push(validateEmpresaCoherente(documents))
  
  // EMP2: Antigüedad coherente
  cotejos.push(validateAntiguedadCoherente(documents))
  
  // ING1: Coherencia de ingresos
  cotejos.push(validateIngresosCoherentes(documents))
  
  return cotejos
}
