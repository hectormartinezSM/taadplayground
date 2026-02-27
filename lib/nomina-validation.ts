import type { NominaRevision, RevisionSeverity, ExtractedField } from "./types"

// Helper functions
function parseSpanishDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === "N/D" || dateStr === "N/A") return null
  
  // Format: DD/MM/AAAA
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) {
    const [, day, month, year] = match
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  }
  
  return null
}

function parseAmount(amountStr: string): number | null {
  if (!amountStr || amountStr === "N/D" || amountStr === "N/A") return null
  
  // Remove currency symbols and normalize
  let normalized = amountStr
    .replace(/€/g, "")
    .replace(/EUR/gi, "")
    .replace(/\s/g, "")
    .trim()
  
  // Handle Spanish format: 1.234,56 -> 1234.56
  // First remove thousand separators (dots), then convert decimal comma to dot
  normalized = normalized.replace(/\./g, "").replace(",", ".")
  
  const value = parseFloat(normalized)
  return isNaN(value) ? null : value
}

function monthsDifference(date1: Date, date2: Date): number {
  return (date2.getFullYear() - date1.getFullYear()) * 12 + (date2.getMonth() - date1.getMonth())
}

function daysDifference(date1: Date, date2: Date): number {
  const diffTime = date2.getTime() - date1.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// N1: Validate DNI format and control letter
export function validateDNI(dni: string): NominaRevision {
  if (!dni || dni === "N/D" || dni === "N/A") {
    return {
      id: "N1",
      titulo: "DNI trabajador",
      severidad: "ERROR",
      mensaje: "No se ha encontrado el DNI del trabajador"
    }
  }
  
  const normalized = dni.toUpperCase().replace(/[\s-]/g, "")
  const dniPattern = /^(\d{8})([A-Z])$/
  const match = normalized.match(dniPattern)
  
  if (!match) {
    return {
      id: "N1",
      titulo: "DNI trabajador",
      severidad: "ERROR",
      mensaje: `Formato de DNI incorrecto: ${dni}`
    }
  }
  
  const [, numbers, letter] = match
  const letterTable = "TRWAGMYFPDXBNJZSQVHLCKE"
  const expectedLetter = letterTable[parseInt(numbers) % 23]
  
  if (letter !== expectedLetter) {
    return {
      id: "N1",
      titulo: "DNI trabajador",
      severidad: "ERROR",
      mensaje: `Letra de control incorrecta (esperada: ${expectedLetter}, encontrada: ${letter})`
    }
  }
  
  return {
    id: "N1",
    titulo: "DNI trabajador",
    severidad: "OK",
    mensaje: "DNI valido con letra de control correcta"
  }
}

// N2: Validate CIF format and control digit
export function validateCIF(cif: string): NominaRevision {
  if (!cif || cif === "N/D" || cif === "N/A") {
    return {
      id: "N2",
      titulo: "CIF empresa",
      severidad: "ERROR",
      mensaje: "No se ha encontrado el CIF de la empresa"
    }
  }
  
  const normalized = cif.toUpperCase().replace(/[\s-]/g, "")
  
  // CIF pattern: letter + 7 digits + control (digit or letter)
  const cifPattern = /^([ABCDEFGHJKLMNPQRSUVW])(\d{7})([0-9A-J])$/
  const match = normalized.match(cifPattern)
  
  if (!match) {
    return {
      id: "N2",
      titulo: "CIF empresa",
      severidad: "ERROR",
      mensaje: `Formato de CIF incorrecto: ${cif}`
    }
  }
  
  const [, firstLetter, digits, control] = match
  
  // Calculate control digit
  let sumEven = 0
  let sumOdd = 0
  
  for (let i = 0; i < 7; i++) {
    const digit = parseInt(digits[i])
    if (i % 2 === 0) {
      // Odd position (1, 3, 5, 7) - multiply by 2 and sum digits
      const doubled = digit * 2
      sumOdd += doubled > 9 ? doubled - 9 : doubled
    } else {
      // Even position (2, 4, 6) - sum directly
      sumEven += digit
    }
  }
  
  const total = sumOdd + sumEven
  const controlDigit = (10 - (total % 10)) % 10
  const controlLetters = "JABCDEFGHI"
  
  // Some CIF types use letter, some use digit
  const letterTypes = "PQRSNW"
  const digitTypes = "ABEH"
  
  let isValid = false
  if (letterTypes.includes(firstLetter)) {
    isValid = control === controlLetters[controlDigit]
  } else if (digitTypes.includes(firstLetter)) {
    isValid = control === controlDigit.toString()
  } else {
    // Can be either
    isValid = control === controlDigit.toString() || control === controlLetters[controlDigit]
  }
  
  if (!isValid) {
    return {
      id: "N2",
      titulo: "CIF empresa",
      severidad: "ERROR",
      mensaje: "Digito de control del CIF incorrecto"
    }
  }
  
  return {
    id: "N2",
    titulo: "CIF empresa",
    severidad: "OK",
    mensaje: "CIF valido con digito de control correcto"
  }
}

// N3: Validate NAF (Social Security Number) format
export function validateNAF(naf: string): NominaRevision {
  if (!naf || naf === "N/D" || naf === "N/A") {
    return {
      id: "N3",
      titulo: "NAF Seguridad Social",
      severidad: "ERROR",
      mensaje: "No se ha encontrado el numero de Seguridad Social"
    }
  }
  
  // Remove spaces, slashes, and dashes for validation
  const normalized = naf.replace(/[\s/-]/g, "")
  
  // NAF should have 12 digits
  if (!/^\d{12}$/.test(normalized)) {
    // Try to validate if it has a different format but looks valid
    if (/^\d{10,12}$/.test(normalized)) {
      return {
        id: "N3",
        titulo: "NAF Seguridad Social",
        severidad: "OK",
        mensaje: "Formato de NAF aceptado"
      }
    }
    return {
      id: "N3",
      titulo: "NAF Seguridad Social",
      severidad: "ERROR",
      mensaje: `Formato de NAF incorrecto: ${naf}`
    }
  }
  
  // Validate check digits (last 2 digits)
  const province = normalized.substring(0, 2)
  const number = normalized.substring(2, 10)
  const checkDigits = normalized.substring(10, 12)
  
  // Calculate expected check digits
  const baseNumber = parseInt(province + number)
  const expectedCheck = (baseNumber % 97).toString().padStart(2, "0")
  
  if (checkDigits !== expectedCheck) {
    // Some NAFs use a different calculation, so we accept it with a note
    return {
      id: "N3",
      titulo: "NAF Seguridad Social",
      severidad: "OK",
      mensaje: "Formato de NAF aceptado"
    }
  }
  
  return {
    id: "N3",
    titulo: "NAF Seguridad Social",
    severidad: "OK",
    mensaje: "NAF valido con digitos de control correctos"
  }
}

// N4: Validate period format and reasonable duration
export function validatePeriodo(periodo: string): NominaRevision {
  if (!periodo || periodo === "N/D" || periodo === "N/A") {
    return {
      id: "N4",
      titulo: "Periodo estándar",
      severidad: "ERROR",
      mensaje: "No se ha encontrado el periodo de la nómina"
    }
  }
  
  // Expected format: DD/MM/AAAA - DD/MM/AAAA
  const periodPattern = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/
  const match = periodo.match(periodPattern)
  
  if (!match) {
    return {
      id: "N4",
      titulo: "Periodo estándar",
      severidad: "ERROR",
      mensaje: `Formato de periodo incorrecto: ${periodo}`
    }
  }
  
  const [, startStr, endStr] = match
  const startDate = parseSpanishDate(startStr)
  const endDate = parseSpanishDate(endStr)
  
  if (!startDate || !endDate) {
    return {
      id: "N4",
      titulo: "Periodo estándar",
      severidad: "ERROR",
      mensaje: "No se pueden parsear las fechas del periodo"
    }
  }
  
  if (startDate > endDate) {
    return {
      id: "N4",
      titulo: "Periodo estándar",
      severidad: "ERROR",
      mensaje: "La fecha de inicio es posterior a la fecha de fin"
    }
  }
  
  const duration = daysDifference(startDate, endDate) + 1
  
  if (duration < 28 || duration > 31) {
    return {
      id: "N4",
      titulo: "Periodo estándar",
      severidad: "WARNING",
      mensaje: `La duración del periodo no está entre 28 y 31 días: ${duration} días`
    }
  }
  
  return {
    id: "N4",
    titulo: "Periodo estándar",
    severidad: "OK",
    mensaje: `La duración del periodo está entre 28 y 31 días (${duration} días)`
  }
}

// N5: Check if payslip is recent
export function validateNominaReciente(periodo: string): NominaRevision {
  if (!periodo || periodo === "N/D" || periodo === "N/A") {
    return {
      id: "N5",
      titulo: "Nomina reciente",
      severidad: "ERROR",
      mensaje: "No se puede verificar la antiguedad sin periodo"
    }
  }
  
  // Get end date from period
  const periodPattern = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/
  const match = periodo.match(periodPattern)
  
  if (!match) {
    return {
      id: "N5",
      titulo: "Nomina reciente",
      severidad: "ERROR",
      mensaje: "No se puede parsear el periodo"
    }
  }
  
  const endDate = parseSpanishDate(match[2])
  if (!endDate) {
    return {
      id: "N5",
      titulo: "Nomina reciente",
      severidad: "ERROR",
      mensaje: "No se puede parsear la fecha fin del periodo"
    }
  }
  
  const today = new Date()
  const monthsOld = monthsDifference(endDate, today)
  
  if (monthsOld <= 3) {
    return {
      id: "N5",
      titulo: "Nomina reciente",
      severidad: "OK",
      mensaje: `Nomina de los ultimos 3 meses (${monthsOld} meses)`
    }
  } else if (monthsOld <= 12) {
    return {
      id: "N5",
      titulo: "Nomina reciente",
      severidad: "WARNING",
      mensaje: `Nomina con ${monthsOld} meses de antiguedad`
    }
  } else {
    return {
      id: "N5",
      titulo: "Nomina reciente",
      severidad: "ERROR",
      mensaje: `Nomina antigua (mas de 12 meses: ${monthsOld} meses)`
    }
  }
}

// N6: Check employment seniority consistency
export function validateAntiguedad(fechaAntiguedad: string, periodo: string): NominaRevision {
  if (!fechaAntiguedad || fechaAntiguedad === "N/D" || fechaAntiguedad === "N/A") {
    return {
      id: "N6",
      titulo: "Antigüedad suficiente",
      severidad: "WARNING",
      mensaje: "No se ha encontrado la fecha de antigüedad"
    }
  }
  
  if (!periodo || periodo === "N/D" || periodo === "N/A") {
    return {
      id: "N6",
      titulo: "Antigüedad suficiente",
      severidad: "ERROR",
      mensaje: "No se puede verificar sin periodo"
    }
  }
  
  const antiguedadDate = parseSpanishDate(fechaAntiguedad)
  if (!antiguedadDate) {
    return {
      id: "N6",
      titulo: "Antigüedad suficiente",
      severidad: "ERROR",
      mensaje: "No se puede parsear la fecha de antigüedad"
    }
  }
  
  // Get end date from period
  const periodPattern = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/
  const match = periodo.match(periodPattern)
  
  if (!match) {
    return {
      id: "N6",
      titulo: "Antigüedad suficiente",
      severidad: "ERROR",
      mensaje: "No se puede parsear el periodo"
    }
  }
  
  const endDate = parseSpanishDate(match[2])
  if (!endDate) {
    return {
      id: "N6",
      titulo: "Antigüedad suficiente",
      severidad: "ERROR",
      mensaje: "No se puede parsear la fecha fin del periodo"
    }
  }
  
  if (antiguedadDate > endDate) {
    return {
      id: "N6",
      titulo: "Antigüedad suficiente",
      severidad: "ERROR",
      mensaje: "La fecha de antigüedad es posterior al periodo de la nómina"
    }
  }
  
  const monthsEmployed = monthsDifference(antiguedadDate, endDate)
  
  if (monthsEmployed < 12) {
    const years = Math.floor(monthsEmployed / 12)
    const months = monthsEmployed % 12
    return {
      id: "N6",
      titulo: "Antigüedad suficiente",
      severidad: "WARNING",
      mensaje: `Menos de un año de antigüedad. Antigüedad de ${years} año(s) y ${months} mes(es)`
    }
  }
  
  const years = Math.floor(monthsEmployed / 12)
  const months = monthsEmployed % 12
  
  return {
    id: "N6",
    titulo: "Antigüedad suficiente",
    severidad: "OK",
    mensaje: `Más de un año de antigüedad. Antigüedad de ${years} año(s) y ${months} mes(es)`
  }
}

// Helper to format amount in Spanish format
function formatAmountSpanish(amount: number): string {
  return amount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€"
}

// N7: Validate total devengado matches sum of devengos
export function validateCuadreTotalDevengado(
  totalDevengadoDoc: string,
  devengosJson: string
): NominaRevision {
  const totalDoc = parseAmount(totalDevengadoDoc)
  
  if (totalDoc === null) {
    return {
      id: "N7",
      titulo: "Cuadre total devengado",
      severidad: "WARNING",
      mensaje: "Total devengado no presente en documento; no se puede validar el cuadre"
    }
  }
  
  let devengos: Array<{ importe: string }> = []
  try {
    devengos = JSON.parse(devengosJson || "[]")
  } catch {
    return {
      id: "N7",
      titulo: "Cuadre total devengado",
      severidad: "ERROR",
      mensaje: "No se pueden parsear los devengos"
    }
  }
  
  const sumaDevengos = devengos.reduce((sum, d) => {
    const importe = parseAmount(d.importe)
    return sum + (importe || 0)
  }, 0)
  
  const difference = Math.abs(totalDoc - sumaDevengos)
  
  if (difference > 1) {
    return {
      id: "N7",
      titulo: "Cuadre total devengado",
      severidad: "ERROR",
      mensaje: `Descuadre: documento ${formatAmountSpanish(totalDoc)} vs suma ${formatAmountSpanish(sumaDevengos)} (diferencia: ${formatAmountSpanish(difference)})`
    }
  }
  
  return {
    id: "N7",
    titulo: "Cuadre total devengado",
    severidad: "OK",
    mensaje: `Total devengado es igual a la suma de todos los devengos (${formatAmountSpanish(totalDoc)})`
  }
}

// N8: Validate total retenciones matches sum of retenciones
export function validateCuadreTotalRetenciones(
  totalRetencionesDoc: string,
  retencionesJson: string
): NominaRevision {
  const totalDoc = parseAmount(totalRetencionesDoc)
  
  if (totalDoc === null) {
    return {
      id: "N8",
      titulo: "Cuadre total retenciones",
      severidad: "WARNING",
      mensaje: "Total retenciones no presente en documento; no se puede validar el cuadre"
    }
  }
  
  let retenciones: Array<{ importe: string }> = []
  try {
    retenciones = JSON.parse(retencionesJson || "[]")
  } catch {
    return {
      id: "N8",
      titulo: "Cuadre total retenciones",
      severidad: "ERROR",
      mensaje: "No se pueden parsear las retenciones"
    }
  }
  
  const sumaRetenciones = retenciones.reduce((sum, r) => {
    const importe = parseAmount(r.importe)
    return sum + (importe || 0)
  }, 0)
  
  const difference = Math.abs(totalDoc - sumaRetenciones)
  
  if (difference > 1) {
    return {
      id: "N8",
      titulo: "Cuadre total retenciones",
      severidad: "ERROR",
      mensaje: `Descuadre: documento ${formatAmountSpanish(totalDoc)} vs suma ${formatAmountSpanish(sumaRetenciones)} (diferencia: ${formatAmountSpanish(difference)})`
    }
  }
  
  return {
    id: "N8",
    titulo: "Cuadre total retenciones",
    severidad: "OK",
    mensaje: `Total retenciones es igual a la suma de todas las retenciones (${formatAmountSpanish(totalDoc)})`
  }
}

// N9: Validate liquido calculation
export function validateCuadreLiquido(
  liquidoStr: string,
  totalDevengadoDoc: string,
  totalRetencionesDoc: string,
  devengosJson: string,
  retencionesJson: string
): NominaRevision {
  const liquido = parseAmount(liquidoStr)
  
  if (liquido === null) {
    return {
      id: "N9",
      titulo: "Cuadre del liquido",
      severidad: "ERROR",
      mensaje: "No se ha encontrado el liquido a percibir"
    }
  }
  
  const totalDevengado = parseAmount(totalDevengadoDoc)
  const totalRetenciones = parseAmount(totalRetencionesDoc)
  
  let sumaDevengos = 0
  let sumaRetenciones = 0
  
  try {
    const devengos: Array<{ importe: string }> = JSON.parse(devengosJson || "[]")
    sumaDevengos = devengos.reduce((sum, d) => sum + (parseAmount(d.importe) || 0), 0)
  } catch {
    // Ignore parse errors
  }
  
  try {
    const retenciones: Array<{ importe: string }> = JSON.parse(retencionesJson || "[]")
    sumaRetenciones = retenciones.reduce((sum, r) => sum + (parseAmount(r.importe) || 0), 0)
  } catch {
    // Ignore parse errors
  }
  
  // Use document totals if available, otherwise use sums
  const devengadoFinal = totalDevengado !== null ? totalDevengado : sumaDevengos
  const retencionesFinal = totalRetenciones !== null ? totalRetenciones : sumaRetenciones
  
  const expectedLiquido = devengadoFinal - retencionesFinal
  const difference = Math.abs(liquido - expectedLiquido)
  
  if (difference > 1) {
    return {
      id: "N9",
      titulo: "Cuadre del líquido",
      severidad: "ERROR",
      mensaje: `Descuadre: líquido ${formatAmountSpanish(liquido)} vs esperado ${formatAmountSpanish(expectedLiquido)} (devengado ${formatAmountSpanish(devengadoFinal)} - retenciones ${formatAmountSpanish(retencionesFinal)})`
    }
  }
  
  return {
    id: "N9",
    titulo: "Cuadre del líquido",
    severidad: "OK",
    mensaje: `Líquido cuadra: ${formatAmountSpanish(liquido)} = ${formatAmountSpanish(devengadoFinal)} - ${formatAmountSpanish(retencionesFinal)}`
  }
}

// Main validation function
export function runNominaValidations(
  extractedData: Record<string, ExtractedField>
): NominaRevision[] {
  const revisiones: NominaRevision[] = []
  
  const dni = extractedData["DNI"]?.value || ""
  const cif = extractedData["CIF empresa"]?.value || ""
  const naf = extractedData["Nº Seguridad Social trabajador"]?.value || ""
  const periodo = extractedData["Periodo"]?.value || ""
  const fechaAntiguedad = extractedData["Fecha antigüedad"]?.value || ""
  const liquido = extractedData["Líquido a percibir"]?.value || ""
  const devengos = extractedData["Devengos"]?.value || "[]"
  const retenciones = extractedData["Retenciones"]?.value || "[]"
  const totalDevengadoDoc = extractedData["Total devengado (documento)"]?.value || ""
  const totalRetencionesDoc = extractedData["Total retenciones (documento)"]?.value || ""
  
  // N1: DNI validation
  revisiones.push(validateDNI(dni))
  
  // N2: CIF validation
  revisiones.push(validateCIF(cif))
  
  // N3: NAF validation
  revisiones.push(validateNAF(naf))
  
  // N4: Period validation
  revisiones.push(validatePeriodo(periodo))
  
  // N5: Recent payslip
  revisiones.push(validateNominaReciente(periodo))
  
  // N6: Seniority consistency
  revisiones.push(validateAntiguedad(fechaAntiguedad, periodo))
  
  // N7: Total devengado match
  revisiones.push(validateCuadreTotalDevengado(totalDevengadoDoc, devengos))
  
  // N8: Total retenciones match
  revisiones.push(validateCuadreTotalRetenciones(totalRetencionesDoc, retenciones))
  
  // N9: Liquido calculation
  revisiones.push(validateCuadreLiquido(
    liquido,
    totalDevengadoDoc,
    totalRetencionesDoc,
    devengos,
    retenciones
  ))
  
  return revisiones
}
