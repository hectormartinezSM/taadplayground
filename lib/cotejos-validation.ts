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
      titulo: "Completitud documental",
      severidad: "OK",
      mensaje: "Documentación obligatoria aportada",
      checklist
    }
  }
  
  return {
    id: "DOC1",
    titulo: "Completitud documental",
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
  const dniDocValue = dniDoc?.extractedData?.["DNI/NIF"]?.value || dniDoc?.extractedData?.["DNI"]?.value
  if (dniDocValue && dniDocValue !== "N/D") {
    dniValues.push({ source: "DNI", dni: dniDocValue.toUpperCase().replace(/[\s\-]/g, "") })
  }
  
  // Get DNI from all nóminas
  const nominas = documents.filter(isNomina)
  for (const nomina of nominas) {
    const nominaDniValue = nomina.extractedData?.["DNI/NIF"]?.value || nomina.extractedData?.["DNI"]?.value
    if (nominaDniValue && nominaDniValue !== "N/D") {
      dniValues.push({ source: "Nómina", dni: nominaDniValue.toUpperCase().replace(/[\s\-]/g, "") })
    }
  }
  
  // Get DNI from Vida Laboral
  const vidaLaboral = documents.find(isVidaLaboral)
  const vidaDniValue = vidaLaboral?.extractedData?.["DNI/NIF"]?.value || vidaLaboral?.extractedData?.["DNI"]?.value
  if (vidaDniValue && vidaDniValue !== "N/D") {
    dniValues.push({ source: "Vida Laboral", dni: vidaDniValue.toUpperCase().replace(/[\s\-]/g, "") })
  }
  
  // Get NIF from Modelo 100
  const modelo100 = documents.find(isModelo100)
  const modelo100NifValue = modelo100?.extractedData?.["DNI/NIF"]?.value || modelo100?.extractedData?.["NIF"]?.value
  if (modelo100NifValue && modelo100NifValue !== "N/D") {
    dniValues.push({ source: "Modelo 100", dni: modelo100NifValue.toUpperCase().replace(/[\s\-]/g, "") })
  }
  
  if (dniValues.length === 0) {
    return {
      id: "ID1",
      titulo: "DNI/NIF consistente",
      severidad: "ERROR",
      mensaje: "No se encontró DNI/NIF en ningún documento"
    }
  }
  
  // Check if all DNIs are the same
  const uniqueDNIs = [...new Set(dniValues.map(d => d.dni))]
  
  if (uniqueDNIs.length === 1) {
    return {
      id: "ID1",
      titulo: "DNI/NIF consistente",
      severidad: "OK",
      mensaje: `El DNI/NIF coincide en todos los documentos (${uniqueDNIs[0]})`
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
    titulo: "DNI/NIF consistente",
    severidad: "ERROR",
    mensaje: `Inconsistencia de DNI/NIF entre documentos: ${differences}`
  }
}

// EMP1: Empresa nómina = Empresa vigente
export function validateEmpresaCoherente(documents: Document[]): Cotejo {
  // Get the most recent nómina
  const nominas = documents.filter(isNomina)
  
  if (nominas.length === 0) {
    return {
      id: "EMP1",
      titulo: "Coherencia de empresa",
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
  const empresaNomina = mostRecentNomina.extractedData?.["Empresa"]?.value || mostRecentNomina.extractedData?.["Nombre empresa"]?.value || ""
  
  if (!empresaNomina || empresaNomina === "N/D") {
    return {
      id: "EMP1",
      titulo: "Coherencia de empresa",
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
            titulo: "Coherencia de empresa",
            severidad: "OK",
            mensaje: "Coincidencia consistente",
            detalle: [
              { label: "Empresa (nómina)", value: empresaNomina },
              { label: "Empresa (vida laboral)", value: empresaVida },
              { label: "Resultado", value: "Coincidencia consistente" }
            ]
          }
        }
        
        return {
          id: "EMP1",
          titulo: "Coherencia de empresa",
          severidad: "ERROR",
          mensaje: "No coinciden",
          detalle: [
            { label: "Empresa (nómina)", value: empresaNomina },
            { label: "Empresa (vida laboral)", value: empresaVida },
            { label: "Resultado", value: "No coinciden" }
          ]
        }
      }
    } catch {
      // Continue to check contrato
    }
  }
  
  // If no Vida Laboral, check Contrato
  const contrato = documents.find(isContrato)
  
  if (contrato) {
    const empresaContrato = contrato.extractedData?.["Empresa"]?.value || 
                            contrato.extractedData?.["Nombre empresa"]?.value || ""
    
    if (empresaContrato && empresaContrato !== "N/D") {
      const normalizeEmpresa = (str: string) => str.toLowerCase().replace(/\s+/g, " ").trim()
      
      if (normalizeEmpresa(empresaNomina).includes(normalizeEmpresa(empresaContrato)) ||
          normalizeEmpresa(empresaContrato).includes(normalizeEmpresa(empresaNomina))) {
        return {
          id: "EMP1",
          titulo: "Coherencia de empresa",
          severidad: "OK",
          mensaje: "Coincidencia consistente",
          detalle: [
            { label: "Empresa (nómina)", value: empresaNomina },
            { label: "Empresa (contrato)", value: empresaContrato },
            { label: "Resultado", value: "Coincidencia consistente" }
          ]
        }
      }
      
      return {
        id: "EMP1",
        titulo: "Coherencia de empresa",
        severidad: "ERROR",
        mensaje: "No coinciden",
        detalle: [
          { label: "Empresa (nómina)", value: empresaNomina },
          { label: "Empresa (contrato)", value: empresaContrato },
          { label: "Resultado", value: "No coinciden" }
        ]
      }
    }
  }
  
  return {
    id: "EMP1",
    titulo: "Coherencia de empresa",
    severidad: "ERROR",
    mensaje: "No se encontró Vida Laboral ni Contrato para comparar empresa"
  }
}

// EMP2: Coherencia de fecha de inicio laboral
export function validateAntiguedadCoherente(documents: Document[]): Cotejo {
  // Get fecha inicio laboral from most recent nómina
  const nominas = documents.filter(isNomina)
  
  if (nominas.length === 0) {
    return {
      id: "EMP2",
      titulo: "Coherencia de fecha de inicio laboral",
      severidad: "ERROR",
      mensaje: "No se encontraron nóminas para comparar fecha de inicio laboral"
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
  const antiguedadNomina = mostRecentNomina.extractedData?.["Fecha de inicio laboral"]?.value || mostRecentNomina.extractedData?.["Fecha antigüedad"]?.value || ""
  
  if (!antiguedadNomina || antiguedadNomina === "N/D") {
    return {
      id: "EMP2",
      titulo: "Coherencia de fecha de inicio laboral",
      severidad: "ERROR",
      mensaje: "No se encontró fecha de inicio laboral en la nómina"
    }
  }
  
  const fechaAntiguedadNomina = parseSpanishDate(antiguedadNomina)
  
  if (!fechaAntiguedadNomina) {
    return {
      id: "EMP2",
      titulo: "Coherencia de fecha de inicio laboral",
      severidad: "ERROR",
      mensaje: "No se pudo parsear la fecha de inicio laboral de la nómina"
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
              titulo: "Coherencia de fecha de inicio laboral",
              severidad: "OK",
              mensaje: "Dentro del margen permitido",
              detalle: [
                { label: "Fecha inicio (nómina)", value: antiguedadNomina },
                { label: "Fecha alta (vida laboral)", value: empleoVigente.fechaAlta },
                { label: "Diferencia", value: `${diffDays} días` },
                { label: "Resultado", value: "Dentro del margen permitido" }
              ]
            }
          }
          
          if (diffDays <= 90) {
            return {
              id: "EMP2",
              titulo: "Coherencia de fecha de inicio laboral",
              severidad: "WARNING",
              mensaje: "Discrepancia leve detectada",
              detalle: [
                { label: "Fecha inicio (nómina)", value: antiguedadNomina },
                { label: "Fecha alta (vida laboral)", value: empleoVigente.fechaAlta },
                { label: "Diferencia", value: `${diffDays} días` },
                { label: "Resultado", value: "Discrepancia leve (>30 días)" }
              ]
            }
          }
          
          return {
            id: "EMP2",
            titulo: "Coherencia de fecha de inicio laboral",
            severidad: "ERROR",
            mensaje: "Discrepancia significativa detectada",
            detalle: [
              { label: "Fecha inicio (nómina)", value: antiguedadNomina },
              { label: "Fecha alta (vida laboral)", value: empleoVigente.fechaAlta },
              { label: "Diferencia", value: `${diffDays} días` },
              { label: "Resultado", value: "Discrepancia significativa (>90 días)" }
            ]
          }
        }
      }
    } catch {
      // Continue
    }
  }
  
  return {
    id: "EMP2",
    titulo: "Coherencia de fecha de inicio laboral",
    severidad: "WARNING",
    mensaje: "No se pudo comparar fecha de inicio laboral con Vida Laboral"
  }
}

// ING1: Coherencia anual de ingresos
export function validateIngresosCoherentes(documents: Document[]): Cotejo {
  // Get the 3 most recent nóminas
  const nominas = documents.filter(isNomina)
  
  if (nominas.length < 3) {
    return {
      id: "ING1",
      titulo: "Coherencia de ingresos laborales",
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
  
  // Calculate average of "Líquido neto mensual"
  const liquidoValues: number[] = []
  for (const nomina of recentNominas) {
    const liquido = nomina.extractedData?.["Líquido neto mensual"]?.value || nomina.extractedData?.["Líquido a percibir"]?.value || ""
    const value = parseAmount(liquido)
    if (value !== null) {
      liquidoValues.push(value)
    }
  }
  
  if (liquidoValues.length < 3) {
    return {
      id: "ING1",
      titulo: "Coherencia de ingresos laborales",
      severidad: "ERROR",
      mensaje: "No se encontró el líquido neto mensual en todas las nóminas"
    }
  }
  
  const promedioNeto = liquidoValues.reduce((sum, v) => sum + v, 0) / liquidoValues.length
  const estimacionAnual = promedioNeto * 12
  
  // Get Rendimiento del trabajo (IRPF) from Modelo 100
  const modelo100 = documents.find(isModelo100)
  
  if (!modelo100) {
    return {
      id: "ING1",
      titulo: "Coherencia de ingresos laborales",
      severidad: "ERROR",
      mensaje: "No se encontró Modelo 100 para comparar ingresos"
    }
  }
  
  const rendimientoTrabajo = modelo100.extractedData?.["Rendimiento del trabajo (IRPF)"]?.value || modelo100.extractedData?.["Rendimiento del trabajo"]?.value || ""
  const rendimientoValue = parseAmount(rendimientoTrabajo)
  
  if (rendimientoValue === null || rendimientoValue === 0) {
    return {
      id: "ING1",
      titulo: "Coherencia de ingresos laborales",
      severidad: "ERROR",
      mensaje: "No se encontró el Rendimiento del trabajo (IRPF) en el Modelo 100"
    }
  }
  
  // Calculate percentage difference
  const diferencia = Math.abs(estimacionAnual - rendimientoValue) / rendimientoValue
  
  // Format amounts for message
  const formatAmount = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€"
  
  // Get the months analyzed
  const mesesAnalizados = recentNominas.map(n => {
    const periodo = n.extractedData?.["Periodo"]?.value || ""
    const match = periodo.match(/(\d{1,2})\/(\d{4})|(\w+)\s+(\d{4})/)
    if (match) {
      return match[0]
    }
    return periodo.substring(0, 15)
  }).join(", ")
  
  if (diferencia <= 0.10) {
    return {
      id: "ING1",
      titulo: "Coherencia de ingresos laborales",
      severidad: "OK",
      mensaje: "Coherencia confirmada",
      detalle: [
        { label: "Nóminas analizadas", value: mesesAnalizados || "3 nóminas más recientes" },
        { label: "Promedio mensual", value: formatAmount(promedioNeto) },
        { label: "Estimación anual", value: formatAmount(estimacionAnual) },
        { label: "Rendimiento del trabajo (IRPF)", value: formatAmount(rendimientoValue) },
        { label: "Diferencia", value: `${(diferencia * 100).toFixed(1)}%` },
        { label: "Resultado", value: "Coherencia confirmada (≤10%)" }
      ]
    }
  }
  
  if (diferencia <= 0.25) {
    return {
      id: "ING1",
      titulo: "Coherencia de ingresos laborales",
      severidad: "WARNING",
      mensaje: "Desviación significativa",
      detalle: [
        { label: "Nóminas analizadas", value: mesesAnalizados || "3 nóminas más recientes" },
        { label: "Promedio mensual", value: formatAmount(promedioNeto) },
        { label: "Estimación anual", value: formatAmount(estimacionAnual) },
        { label: "Rendimiento del trabajo (IRPF)", value: formatAmount(rendimientoValue) },
        { label: "Diferencia", value: `${(diferencia * 100).toFixed(1)}%` },
        { label: "Resultado", value: "Desviación significativa (10-25%)" }
      ]
    }
  }
  
  return {
    id: "ING1",
    titulo: "Coherencia de ingresos laborales",
    severidad: "ERROR",
    mensaje: "Incoherencia detectada",
    detalle: [
      { label: "Nóminas analizadas", value: mesesAnalizados || "3 nóminas más recientes" },
      { label: "Promedio mensual", value: formatAmount(promedioNeto) },
      { label: "Estimación anual", value: formatAmount(estimacionAnual) },
      { label: "Rendimiento del trabajo (IRPF)", value: formatAmount(rendimientoValue) },
      { label: "Diferencia", value: `${(diferencia * 100).toFixed(1)}%` },
      { label: "Resultado", value: "Incoherencia detectada (>25%)" }
    ]
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
