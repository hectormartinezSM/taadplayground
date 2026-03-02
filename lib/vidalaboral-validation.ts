import type { ExtractedField } from "./types"

// Vida Laboral Revision type
export interface VidaLaboralRevision {
  id: string
  titulo: string
  severidad: "OK" | "WARNING" | "ERROR"
  mensaje: string
}

// Helper to parse Spanish date DD/MM/YYYY
function parseSpanishDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === "N/D" || dateStr === "N/A" || dateStr === "---") return null
  
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) {
    const [, day, month, year] = match
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  }
  return null
}

// Calculate months difference
function monthsDifference(startDate: Date, endDate: Date): number {
  return (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
         (endDate.getMonth() - startDate.getMonth())
}

// DNI/NIF control letter table
const NIF_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE"

// VL3: Validate NAF (Numero Afiliacion Seguridad Social)
export function validateNAF(naf: string): VidaLaboralRevision {
  if (!naf || naf === "N/D" || naf === "N/A" || naf.trim() === "") {
    return {
      id: "VL3",
      titulo: "NAF válido",
      severidad: "ERROR",
      mensaje: "NAF no encontrado en el documento"
    }
  }
  
  // Normalize: remove spaces, slashes, hyphens
  const normalizedNAF = naf.replace(/[\s\/\-]/g, "")
  
  // NAF should be 12 digits (PP/NNNNNNNN-CC format = 12 digits total)
  if (!/^\d{12}$/.test(normalizedNAF)) {
    return {
      id: "VL3",
      titulo: "NAF válido",
      severidad: "ERROR",
      mensaje: `Formato de NAF incorrecto: ${naf}`
    }
  }
  
  // Extract parts: PP (province) + NNNNNNNN (number) + CC (control)
  const province = normalizedNAF.substring(0, 2)
  const number = normalizedNAF.substring(2, 10)
  const control = normalizedNAF.substring(10, 12)
  
  // Validate control digits
  // The control is calculated as: (province + number) % 97
  const fullNumber = parseInt(province + number)
  const expectedControl = fullNumber % 97
  const actualControl = parseInt(control)
  
  if (expectedControl !== actualControl) {
    return {
      id: "VL3",
      titulo: "NAF válido",
      severidad: "ERROR",
      mensaje: `Dígitos de control NAF incorrectos: ${naf}`
    }
  }
  
  return {
    id: "VL3",
    titulo: "NAF válido",
    severidad: "OK",
    mensaje: `NAF válido con dígitos de control correctos: ${naf}`
  }
}

// VL4: Validate DNI control letter
export function validateDNI(dni: string): VidaLaboralRevision {
  if (!dni || dni === "N/D" || dni === "N/A" || dni.trim() === "") {
    return {
      id: "VL4",
      titulo: "DNI/NIF válido",
      severidad: "ERROR",
      mensaje: "DNI/NIF no encontrado en el documento"
    }
  }
  
  // Normalize: remove spaces, hyphens, convert to uppercase
  let normalizedDNI = dni.replace(/[\s\-]/g, "").toUpperCase()
  
  // If DNI has 9 digits + 1 letter and starts with 0, remove the leading zero
  if (/^0\d{8}[A-Z]$/.test(normalizedDNI)) {
    normalizedDNI = normalizedDNI.substring(1)
  }
  
  // Check format: 8 digits + 1 letter
  const dniPattern = /^(\d{8})([A-Z])$/
  const match = normalizedDNI.match(dniPattern)
  
  if (!match) {
    return {
      id: "VL4",
      titulo: "DNI/NIF válido",
      severidad: "ERROR",
      mensaje: `Formato de DNI/NIF incorrecto: ${dni}`
    }
  }
  
  const [, numbers, letter] = match
  const expectedLetter = NIF_LETTERS[parseInt(numbers) % 23]
  
  if (letter !== expectedLetter) {
    return {
      id: "VL4",
      titulo: "DNI/NIF válido",
      severidad: "ERROR",
      mensaje: `Letra de control incorrecta: ${dni} (esperada: ${expectedLetter})`
    }
  }
  
  return {
    id: "VL4",
    titulo: "DNI/NIF válido",
    severidad: "OK",
    mensaje: `DNI/NIF válido con letra de control correcta: ${dni}`
  }
}

// VL2: Document recency check
export function validateDocumentoReciente(fechaDocumento: string): VidaLaboralRevision {
  if (!fechaDocumento || fechaDocumento === "N/D" || fechaDocumento === "N/A") {
    return {
      id: "VL2",
      titulo: "Actualidad del documento",
      severidad: "ERROR",
      mensaje: "Fecha del documento no encontrada"
    }
  }
  
  const docDate = parseSpanishDate(fechaDocumento)
  if (!docDate) {
    return {
      id: "VL2",
      titulo: "Actualidad del documento",
      severidad: "ERROR",
      mensaje: `Formato de fecha inválido: ${fechaDocumento}`
    }
  }
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // Check if future date
  if (docDate > today) {
    return {
      id: "VL2",
      titulo: "Actualidad del documento",
      severidad: "ERROR",
      mensaje: `Fecha del documento es futura: ${fechaDocumento}`
    }
  }
  
  const months = monthsDifference(docDate, today)
  
  if (months <= 3) {
    return {
      id: "VL2",
      titulo: "Actualidad del documento",
      severidad: "OK",
      mensaje: `Documento emitido hace ${months} mes(es)`
    }
  }
  
  if (months <= 12) {
    return {
      id: "VL2",
      titulo: "Actualidad del documento",
      severidad: "WARNING",
      mensaje: `Documento emitido hace ${months} mes(es) (entre 3 y 12 meses)`
    }
  }
  
  return {
    id: "VL2",
    titulo: "Actualidad del documento",
    severidad: "ERROR",
    mensaje: `Documento emitido hace más de 12 meses (${months} meses)`
  }
}

// Parse situaciones JSON
interface Situacion {
  empresa: string
  fechaAlta: string
  fechaBaja: string
  diasCotizados: number | string
}

function parseSituaciones(situacionesJson: string): Situacion[] {
  try {
    return JSON.parse(situacionesJson || "[]")
  } catch {
    return []
  }
}

// VL5: Check temporal order of situaciones
export function validateOrdenTemporal(situacionesJson: string): VidaLaboralRevision {
  const situaciones = parseSituaciones(situacionesJson)
  
  if (situaciones.length === 0) {
    return {
      id: "VL5",
      titulo: "Orden temporal correcto",
      severidad: "ERROR",
      mensaje: "No se encontraron situaciones laborales"
    }
  }
  
  // Check if first situation is the current one (fechaBaja = "---")
  const firstHasOpenEnd = situaciones[0]?.fechaBaja === "---"
  const hasAnyOpen = situaciones.some(s => s.fechaBaja === "---")
  
  if (hasAnyOpen && !firstHasOpenEnd) {
    return {
      id: "VL5",
      titulo: "Orden temporal correcto",
      severidad: "ERROR",
      mensaje: "La situación vigente no está en primera posición"
    }
  }
  
  // Check that dates are in descending order (most recent first)
  for (let i = 1; i < situaciones.length; i++) {
    const prevFechaAlta = parseSpanishDate(situaciones[i - 1].fechaAlta)
    const currFechaAlta = parseSpanishDate(situaciones[i].fechaAlta)
    
    if (prevFechaAlta && currFechaAlta && prevFechaAlta < currFechaAlta) {
      return {
        id: "VL5",
        titulo: "Orden temporal correcto",
        severidad: "ERROR",
        mensaje: "Las situaciones no están ordenadas de más reciente a más antigua"
      }
    }
  }
  
  return {
    id: "VL5",
    titulo: "Orden temporal correcto",
    severidad: "OK",
    mensaje: "Situaciones ordenadas correctamente de más reciente a más antigua"
  }
}

// VL6: Check date coherence for each situacion
export function validateCoherenciaFechas(situacionesJson: string, fechaDocumento: string): VidaLaboralRevision {
  const situaciones = parseSituaciones(situacionesJson)
  const docDate = parseSpanishDate(fechaDocumento)
  
  if (situaciones.length === 0) {
    return {
      id: "VL6",
      titulo: "Coherencia de fechas",
      severidad: "ERROR",
      mensaje: "No se encontraron situaciones laborales"
    }
  }
  
  for (let i = 0; i < situaciones.length; i++) {
    const sit = situaciones[i]
    const fechaAlta = parseSpanishDate(sit.fechaAlta)
    
    if (!fechaAlta) {
      return {
        id: "VL6",
        titulo: "Coherencia de fechas",
        severidad: "ERROR",
        mensaje: `Situación ${i + 1}: fecha de alta inválida (${sit.fechaAlta})`
      }
    }
    
    if (sit.fechaBaja && sit.fechaBaja !== "---") {
      const fechaBaja = parseSpanishDate(sit.fechaBaja)
      
      if (!fechaBaja) {
        return {
          id: "VL6",
          titulo: "Coherencia de fechas",
          severidad: "ERROR",
          mensaje: `Situación ${i + 1}: fecha de baja inválida (${sit.fechaBaja})`
        }
      }
      
      if (fechaAlta > fechaBaja) {
        return {
          id: "VL6",
          titulo: "Coherencia de fechas",
          severidad: "ERROR",
          mensaje: `Situación ${i + 1}: fecha de alta (${sit.fechaAlta}) posterior a fecha de baja (${sit.fechaBaja})`
        }
      }
    } else {
      // No fechaBaja means current job - fechaAlta should be <= fechaDocumento
      if (docDate && fechaAlta > docDate) {
        return {
          id: "VL6",
          titulo: "Coherencia de fechas",
          severidad: "ERROR",
          mensaje: `Situación ${i + 1}: fecha de alta (${sit.fechaAlta}) posterior a fecha del documento (${fechaDocumento})`
        }
      }
    }
  }
  
  return {
    id: "VL6",
    titulo: "Coherencia de fechas",
    severidad: "OK",
    mensaje: "Todas las fechas de las situaciones son coherentes"
  }
}

// VL7: Check current employment situations
export function validateSituacionesVigentes(situacionesJson: string): VidaLaboralRevision {
  const situaciones = parseSituaciones(situacionesJson)
  
  const vigentes = situaciones.filter(s => s.fechaBaja === "---")
  
  if (vigentes.length === 1) {
    return {
      id: "VL7",
      titulo: "Situaciones vigentes",
      severidad: "OK",
      mensaje: "Una situación laboral vigente"
    }
  }
  
  if (vigentes.length === 0) {
    return {
      id: "VL7",
      titulo: "Situaciones vigentes",
      severidad: "WARNING",
      mensaje: "Sin empleo vigente actualmente"
    }
  }
  
  return {
    id: "VL7",
    titulo: "Situaciones vigentes",
    severidad: "WARNING",
    mensaje: `${vigentes.length} situaciones vigentes (posible pluriempleo)`
  }
}

// VL9: Validate total days contributed
export function validateTotalDiasCotizados(totalDias: string, situacionesJson: string): VidaLaboralRevision {
  const total = parseInt(totalDias?.replace(/\D/g, "") || "0")
  const situaciones = parseSituaciones(situacionesJson)
  
  if (isNaN(total) || total === 0) {
    return {
      id: "VL9",
      titulo: "Total días cotizados coherente",
      severidad: "ERROR",
      mensaje: "Total de días cotizados no encontrado o inválido"
    }
  }
  
  const sumaDias5 = situaciones.reduce((sum, sit) => {
    const dias = typeof sit.diasCotizados === "string" 
      ? parseInt(sit.diasCotizados.replace(/\D/g, "") || "0")
      : sit.diasCotizados || 0
    return sum + dias
  }, 0)
  
  if (total < sumaDias5) {
    return {
      id: "VL9",
      titulo: "Total días cotizados coherente",
      severidad: "ERROR",
      mensaje: `Incoherencia: total (${total.toLocaleString("es-ES")} días) < suma de situaciones (${sumaDias5.toLocaleString("es-ES")} días)`
    }
  }
  
  return {
    id: "VL9",
    titulo: "Total días cotizados coherente",
    severidad: "OK",
    mensaje: `Total coherente: ${total.toLocaleString("es-ES")} días >= suma situaciones (${sumaDias5.toLocaleString("es-ES")} días)`
  }
}

// VL10: Check seniority in current job
export function validateAntiguedadEmpleoActual(situacionesJson: string, fechaDocumento: string): VidaLaboralRevision {
  const situaciones = parseSituaciones(situacionesJson)
  const docDate = parseSpanishDate(fechaDocumento)
  
  const vigente = situaciones.find(s => s.fechaBaja === "---")
  
  if (!vigente) {
    return {
      id: "VL10",
      titulo: "Antigüedad laboral suficiente",
      severidad: "WARNING",
      mensaje: "Sin empleo vigente"
    }
  }
  
  const fechaAlta = parseSpanishDate(vigente.fechaAlta)
  
  if (!fechaAlta || !docDate) {
    return {
      id: "VL10",
      titulo: "Antigüedad laboral suficiente",
      severidad: "WARNING",
      mensaje: "No se puede calcular la antigüedad"
    }
  }
  
  const meses = monthsDifference(fechaAlta, docDate)
  const anios = Math.floor(meses / 12)
  const mesesRestantes = meses % 12
  
  if (meses >= 12) {
    return {
      id: "VL10",
      titulo: "Antigüedad laboral suficiente",
      severidad: "OK",
      mensaje: `Más de un año de antigüedad. Antigüedad de ${anios} año(s) y ${mesesRestantes} mes(es)`
    }
  }
  
  return {
    id: "VL10",
    titulo: "Antigüedad laboral suficiente",
    severidad: "WARNING",
    mensaje: `Menos de un año de antigüedad (${meses} meses)`
  }
}

// Main function to run all Vida Laboral validations
export function runVidaLaboralValidations(
  extractedData: Record<string, ExtractedField>
): VidaLaboralRevision[] {
  const revisiones: VidaLaboralRevision[] = []
  
  const naf = extractedData["Nº Seguridad Social trabajador"]?.value || ""
  const dni = extractedData["DNI/NIF"]?.value || extractedData["DNI"]?.value || ""
  const fechaDocumento = extractedData["Fecha documento"]?.value || ""
  const situacionesJson = extractedData["Situaciones"]?.value || "[]"
  const totalDias = extractedData["Total días cotizados"]?.value || ""
  
  // VL3: NAF valido
  revisiones.push(validateNAF(naf))
  
  // VL4: DNI valido
  revisiones.push(validateDNI(dni))
  
  // VL2: Documento reciente
  revisiones.push(validateDocumentoReciente(fechaDocumento))
  
  // VL5: Orden temporal correcto
  revisiones.push(validateOrdenTemporal(situacionesJson))
  
  // VL6: Coherencia de fechas
  revisiones.push(validateCoherenciaFechas(situacionesJson, fechaDocumento))
  
  // VL7: Situaciones vigentes
  revisiones.push(validateSituacionesVigentes(situacionesJson))
  
  // VL9: Total dias cotizados coherente
  revisiones.push(validateTotalDiasCotizados(totalDias, situacionesJson))
  
  // VL10: Antiguedad en empleo actual
  revisiones.push(validateAntiguedadEmpleoActual(situacionesJson, fechaDocumento))
  
  return revisiones
}
