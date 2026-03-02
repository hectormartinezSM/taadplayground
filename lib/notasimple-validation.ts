import type { ExtractedField } from "./types"

// Nota Simple Revision type
export interface NotaSimpleRevision {
  id: string
  titulo: string
  severidad: "OK" | "WARNING" | "ERROR"
  mensaje: string
}

// DNI control letter table
const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE"

// Helper to parse Spanish date DD/MM/YYYY
function parseSpanishDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === "N/D" || dateStr === "N/A") return null
  
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) {
    const [, day, month, year] = match
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  }
  return null
}

// Helper to calculate months difference
function monthsDifference(date1: Date, date2: Date): number {
  const months = (date2.getFullYear() - date1.getFullYear()) * 12
  return months + date2.getMonth() - date1.getMonth()
}

// Helper to format date in Spanish format
function formatSpanishDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, "0")
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

// NS2: Nota reciente
export function validateNotaReciente(fechaNota: string): NotaSimpleRevision {
  if (!fechaNota || fechaNota === "N/D" || fechaNota === "N/A") {
    return {
      id: "NS2",
      titulo: "Actualidad del documento",
      severidad: "ERROR",
      mensaje: "Nota simple desactualizada: fecha no encontrada"
    }
  }
  
  const fechaDate = parseSpanishDate(fechaNota)
  if (!fechaDate) {
    return {
      id: "NS2",
      titulo: "Actualidad del documento",
      severidad: "ERROR",
      mensaje: "Nota simple desactualizada: formato de fecha inválido"
    }
  }
  
  const today = new Date()
  
  // Calculate the minimum valid date (6 months ago)
  const minValidDate = new Date(today)
  minValidDate.setMonth(minValidDate.getMonth() - 6)
  
  // ERROR if future date
  if (fechaDate > today) {
    return {
      id: "NS2",
      titulo: "Actualidad del documento",
      severidad: "ERROR",
      mensaje: `Nota simple desactualizada: fecha ${fechaNota} es futura`
    }
  }
  
  const monthsAgo = monthsDifference(fechaDate, today)
  
  // OK if less than 3 months
  if (monthsAgo < 3) {
    return {
      id: "NS2",
      titulo: "Actualidad del documento",
      severidad: "OK",
      mensaje: `Nota simple reciente (fecha: ${fechaNota})`
    }
  }
  
  // WARNING if between 3 and 6 months
  if (monthsAgo >= 3 && monthsAgo <= 6) {
    return {
      id: "NS2",
      titulo: "Actualidad del documento",
      severidad: "WARNING",
      mensaje: `Nota simple con antigüedad superior a 3 meses (fecha: ${fechaNota})`
    }
  }
  
  // ERROR if more than 6 months
  return {
    id: "NS2",
    titulo: "Actualidad del documento",
    severidad: "ERROR",
    mensaje: `Nota simple desactualizada: fecha ${fechaNota}, validez esperada posterior a ${formatSpanishDate(minValidDate)}`
  }
}

// NS4: CRU estructuralmente valido
export function validateCRU(cru: string): NotaSimpleRevision {
  if (!cru || cru === "N/D" || cru === "N/A" || cru.trim() === "") {
    return {
      id: "NS4",
      titulo: "CRU válido",
      severidad: "WARNING",
      mensaje: "CRU no presente en el documento"
    }
  }
  
  // Remove spaces, hyphens
  const normalizedCRU = cru.replace(/[\s\-]/g, "")
  
  // CRU/IDUFIR must be exactly 14 numeric characters
  if (/^\d{14}$/.test(normalizedCRU)) {
    return {
      id: "NS4",
      titulo: "CRU válido",
      severidad: "OK",
      mensaje: `CRU estructuralmente válido: ${cru}`
    }
  }
  
  // Check why it's invalid
  const digitsOnly = normalizedCRU.replace(/\D/g, "")
  const length = digitsOnly.length
  
  if (length !== 14) {
    return {
      id: "NS4",
      titulo: "CRU válido",
      severidad: "ERROR",
      mensaje: `CRU con formato inválido: ${cru} (debe tener 14 dígitos, tiene ${length})`
    }
  }
  
  return {
    id: "NS4",
    titulo: "CRU válido",
    severidad: "ERROR",
    mensaje: `CRU con formato inválido: ${cru} (contiene caracteres no numéricos)`
  }
}

// Helper to convert participation to decimal
function parseParticipacion(participacion: string): number | null {
  if (!participacion || participacion === "N/D" || participacion === "N/A") {
    return null
  }
  
  const normalized = participacion.trim()
  
  // Try percentage format: "50%", "50 %", "100%"
  const percentMatch = normalized.match(/^([\d,\.]+)\s*%$/)
  if (percentMatch) {
    const value = parseFloat(percentMatch[1].replace(",", "."))
    return value / 100
  }
  
  // Try fraction format: "1/2", "1/3", "2/3"
  const fractionMatch = normalized.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (fractionMatch) {
    const numerator = parseInt(fractionMatch[1])
    const denominator = parseInt(fractionMatch[2])
    if (denominator !== 0) {
      return numerator / denominator
    }
  }
  
  // Try decimal format: "0.5", "0,5"
  const decimalValue = parseFloat(normalized.replace(",", "."))
  if (!isNaN(decimalValue) && decimalValue >= 0 && decimalValue <= 1) {
    return decimalValue
  }
  
  // Try "pleno dominio" or "100" as 1.0
  if (normalized.toLowerCase().includes("pleno dominio") || normalized === "100") {
    return 1.0
  }
  
  return null
}

// NS6: Participaciones coherentes
// Usufructo y Nuda propiedad cuentan como la mitad de su valor nominal
export function validateParticipaciones(titularidadesJson: string): NotaSimpleRevision {
  if (!titularidadesJson || titularidadesJson === "N/D" || titularidadesJson === "N/A") {
    return {
      id: "NS6",
      titulo: "Participaciones coherentes",
      severidad: "WARNING",
      mensaje: "Participaciones no alcanzan el 100%"
    }
  }
  
  let titularidades: Array<{ participacion?: string; tipoDerecho?: string }> = []
  try {
    titularidades = JSON.parse(titularidadesJson)
  } catch {
    return {
      id: "NS6",
      titulo: "Participaciones coherentes",
      severidad: "WARNING",
      mensaje: "Participaciones no alcanzan el 100%"
    }
  }
  
  if (!Array.isArray(titularidades) || titularidades.length === 0) {
    return {
      id: "NS6",
      titulo: "Participaciones coherentes",
      severidad: "WARNING",
      mensaje: "Participaciones no alcanzan el 100%"
    }
  }
  
  let suma = 0
  let allParsed = true
  
  for (const titular of titularidades) {
    const participacion = parseParticipacion(titular.participacion || "")
    if (participacion === null) {
      allParsed = false
    } else {
      // Usufructo y Nuda propiedad cuentan como mitad
      const tipoDerecho = (titular.tipoDerecho || "").toLowerCase()
      const isUsufructoOrNuda = tipoDerecho.includes("usufructo") || tipoDerecho.includes("nuda")
      
      if (isUsufructoOrNuda) {
        suma += participacion / 2
      } else {
        suma += participacion
      }
    }
  }
  
  // If we couldn't parse all participations, use WARNING
  if (!allParsed && suma === 0) {
    return {
      id: "NS6",
      titulo: "Participaciones coherentes",
      severidad: "WARNING",
      mensaje: "Participaciones no alcanzan el 100%"
    }
  }
  
  // Check with tolerance ±0.01
  if (suma >= 0.99 && suma <= 1.01) {
    return {
      id: "NS6",
      titulo: "Participaciones coherentes",
      severidad: "OK",
      mensaje: `Participaciones coherentes (${(suma * 100).toFixed(0)}%)`
    }
  }
  
  if (suma > 1.01) {
    return {
      id: "NS6",
      titulo: "Participaciones coherentes",
      severidad: "ERROR",
      mensaje: `Participaciones superiores al 100% (${(suma * 100).toFixed(1)}%)`
    }
  }
  
  // suma < 0.99
  return {
    id: "NS6",
    titulo: "Participaciones coherentes",
    severidad: "WARNING",
    mensaje: `Participaciones no alcanzan el 100% (${(suma * 100).toFixed(1)}%)`
  }
}

// NS7A: Cargas hipotecarias
export function validateCargasHipotecarias(tieneCargas: string): NotaSimpleRevision {
  if (!tieneCargas || tieneCargas === "N/D" || tieneCargas === "N/A") {
    return {
      id: "NS7A",
      titulo: "Cargas hipotecarias",
      severidad: "OK",
      mensaje: "No constan cargas hipotecarias"
    }
  }
  
  const normalizedCargas = tieneCargas.toLowerCase()
  
  // Check for "hipoteca" keyword
  if (normalizedCargas.includes("hipoteca")) {
    return {
      id: "NS7A",
      titulo: "Cargas hipotecarias",
      severidad: "WARNING",
      mensaje: "Existen cargas hipotecarias"
    }
  }
  
  // If says "Sí" or similar, assume there are charges but check for hipoteca specifically
  if (normalizedCargas === "sí" || normalizedCargas === "si" || normalizedCargas === "yes") {
    // We don't know if they are hipotecas, so check if the field contains more info
    return {
      id: "NS7A",
      titulo: "Cargas hipotecarias",
      severidad: "OK",
      mensaje: "No constan cargas hipotecarias"
    }
  }
  
  return {
    id: "NS7A",
    titulo: "Cargas hipotecarias",
    severidad: "OK",
    mensaje: "No constan cargas hipotecarias"
  }
}

// NS7B: Embargos
export function validateEmbargos(tieneCargas: string): NotaSimpleRevision {
  if (!tieneCargas || tieneCargas === "N/D" || tieneCargas === "N/A") {
    return {
      id: "NS7B",
      titulo: "Embargos",
      severidad: "OK",
      mensaje: "No constan embargos"
    }
  }
  
  const normalizedCargas = tieneCargas.toLowerCase()
  
  // Check for embargo keywords
  const embargoKeywords = ["embargo", "anotacion preventiva", "anotación preventiva", "afeccion ejecutiva", "afección ejecutiva"]
  
  for (const keyword of embargoKeywords) {
    if (normalizedCargas.includes(keyword)) {
      return {
        id: "NS7B",
        titulo: "Embargos",
        severidad: "WARNING",
        mensaje: "Existen embargos o anotaciones preventivas"
      }
    }
  }
  
  return {
    id: "NS7B",
    titulo: "Embargos",
    severidad: "OK",
    mensaje: "No constan embargos"
  }
}

// NS8: DNI titulares valido
export function validateDNITitulares(titularidadesJson: string): NotaSimpleRevision {
  if (!titularidadesJson || titularidadesJson === "N/D" || titularidadesJson === "N/A") {
    return {
      id: "NS8",
      titulo: "DNI/NIF titulares válido",
      severidad: "WARNING",
      mensaje: "Alguno de los titulares no tiene DNI/NIF informado"
    }
  }
  
  let titularidades: Array<{ dni?: string }> = []
  try {
    titularidades = JSON.parse(titularidadesJson)
  } catch {
    return {
      id: "NS8",
      titulo: "DNI/NIF titulares válido",
      severidad: "WARNING",
      mensaje: "Alguno de los titulares no tiene DNI/NIF informado"
    }
  }
  
  if (!Array.isArray(titularidades) || titularidades.length === 0) {
    return {
      id: "NS8",
      titulo: "DNI/NIF titulares válido",
      severidad: "WARNING",
      mensaje: "Alguno de los titulares no tiene DNI/NIF informado"
    }
  }
  
  let hasInvalidDNI = false
  let hasMissingDNI = false
  
  for (const titular of titularidades) {
    const dni = titular.dni
    
    if (!dni || dni === "N/D" || dni === "N/A" || dni.trim() === "") {
      hasMissingDNI = true
      continue
    }
    
    // Normalize DNI
    let normalizedDNI = dni.replace(/[\s\-]/g, "").toUpperCase()
    
    // If 9 digits + letter and starts with 0, remove leading zero
    if (/^0\d{8}[A-Z]$/.test(normalizedDNI)) {
      normalizedDNI = normalizedDNI.substring(1)
    }
    
    // Check format: 8 digits + 1 letter
    const dniPattern = /^(\d{8})([A-Z])$/
    const match = normalizedDNI.match(dniPattern)
    
    if (!match) {
      hasInvalidDNI = true
      continue
    }
    
    const [, numbers, letter] = match
    const expectedLetter = DNI_LETTERS[parseInt(numbers) % 23]
    
    if (letter !== expectedLetter) {
      hasInvalidDNI = true
    }
  }
  
  if (hasInvalidDNI) {
    return {
      id: "NS8",
      titulo: "DNI/NIF titulares válido",
      severidad: "ERROR",
      mensaje: "DNI/NIF de titular inválido"
    }
  }
  
  if (hasMissingDNI) {
    return {
      id: "NS8",
      titulo: "DNI/NIF titulares válido",
      severidad: "WARNING",
      mensaje: "Alguno de los titulares no tiene DNI/NIF informado"
    }
  }
  
  return {
    id: "NS8",
    titulo: "DNI/NIF titulares válido",
    severidad: "OK",
    mensaje: "DNI/NIF de titulares válidos"
  }
}

// Main function to run all Nota Simple validations
export function runNotaSimpleValidations(
  extractedData: Record<string, ExtractedField>
): NotaSimpleRevision[] {
  const revisiones: NotaSimpleRevision[] = []
  
  const fechaNota = extractedData["Fecha de la nota"]?.value || ""
  const cru = extractedData["CRU"]?.value || ""
  const tieneCargas = extractedData["¿Tiene cargas?"]?.value || ""
  const titularidades = extractedData["Titularidades"]?.value || ""
  
  // NS2: Nota reciente
  revisiones.push(validateNotaReciente(fechaNota))
  
  // NS4: CRU valido
  revisiones.push(validateCRU(cru))
  
  // NS6: Participaciones coherentes
  revisiones.push(validateParticipaciones(titularidades))
  
  // NS7A: Cargas hipotecarias
  revisiones.push(validateCargasHipotecarias(tieneCargas))
  
  // NS7B: Embargos
  revisiones.push(validateEmbargos(tieneCargas))
  
  // NS8: DNI titulares valido
  revisiones.push(validateDNITitulares(titularidades))
  
  return revisiones
}
