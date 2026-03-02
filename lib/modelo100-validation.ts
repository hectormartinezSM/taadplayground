import type { ExtractedField } from "./types"

// Modelo 100 Revision type (same structure as DNI/Nomina)
export interface Modelo100Revision {
  id: string
  titulo: string
  severidad: "OK" | "WARNING" | "ERROR"
  mensaje: string
}

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

// DNI/NIF control letter table
const NIF_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE"

// M0: Validate NIF control digit
export function validateNIF(nif: string): Modelo100Revision {
  if (!nif || nif === "N/D" || nif === "N/A" || nif.trim() === "") {
    return {
      id: "M0",
      titulo: "DNI/NIF válido",
      severidad: "ERROR",
      mensaje: "DNI/NIF no encontrado en el documento"
    }
  }
  
  // Normalize: remove spaces, hyphens, convert to uppercase
  const normalizedNIF = nif.replace(/[\s\-]/g, "").toUpperCase()
  
  // Check format: 8 digits + 1 letter
  const nifPattern = /^(\d{8})([A-Z])$/
  const match = normalizedNIF.match(nifPattern)
  
  if (!match) {
    return {
      id: "M0",
      titulo: "DNI/NIF válido",
      severidad: "ERROR",
      mensaje: `Formato de DNI/NIF incorrecto: ${nif}`
    }
  }
  
  const [, numbers, letter] = match
  const expectedLetter = NIF_LETTERS[parseInt(numbers) % 23]
  
  if (letter !== expectedLetter) {
    return {
      id: "M0",
      titulo: "DNI/NIF válido",
      severidad: "ERROR",
      mensaje: `Letra de control incorrecta: ${nif} (esperada: ${expectedLetter})`
    }
  }
  
  return {
    id: "M0",
    titulo: "DNI/NIF válido",
    severidad: "OK",
    mensaje: `DNI/NIF válido con letra de control correcta: ${nif}`
  }
}

// M1: Coherencia ejercicio vs fecha presentacion (OK/ERROR only)
export function validateCoherenciaEjercicio(periodo: string, fechaPresentacion: string): Modelo100Revision {
  if (!periodo || periodo === "N/D" || periodo === "N/A") {
    return {
      id: "M1",
      titulo: "Coherencia ejercicio vs fecha presentación",
      severidad: "ERROR",
      mensaje: `Incoherencia: ejercicio ${periodo || "no encontrado"}, fecha presentación ${fechaPresentacion || "no encontrada"}`
    }
  }
  
  if (!fechaPresentacion || fechaPresentacion === "N/D" || fechaPresentacion === "N/A") {
    return {
      id: "M1",
      titulo: "Coherencia ejercicio vs fecha presentación",
      severidad: "ERROR",
      mensaje: `Incoherencia: ejercicio ${periodo}, fecha presentación no encontrada`
    }
  }
  
  const ejercicio = parseInt(periodo)
  if (isNaN(ejercicio)) {
    return {
      id: "M1",
      titulo: "Coherencia ejercicio vs fecha presentación",
      severidad: "ERROR",
      mensaje: `Incoherencia: ejercicio inválido (${periodo}), fecha presentación ${fechaPresentacion}`
    }
  }
  
  const fechaDate = parseSpanishDate(fechaPresentacion)
  if (!fechaDate) {
    return {
      id: "M1",
      titulo: "Coherencia ejercicio vs fecha presentación",
      severidad: "ERROR",
      mensaje: `Incoherencia: ejercicio ${periodo}, fecha presentación inválida (${fechaPresentacion})`
    }
  }
  
  const anoPresentacion = fechaDate.getFullYear()
  
  // ERROR si año_presentacion < Periodo (imposible)
  // ERROR si año_presentacion > Periodo + 2 (demasiado tarde)
  // OK en cualquier otro caso (Periodo <= año_presentacion <= Periodo+2)
  if (anoPresentacion < ejercicio || anoPresentacion > ejercicio + 2) {
    return {
      id: "M1",
      titulo: "Coherencia ejercicio vs fecha presentación",
      severidad: "ERROR",
      mensaje: `Incoherencia: ejercicio ${periodo}, año de presentación ${anoPresentacion}`
    }
  }
  
  return {
    id: "M1",
    titulo: "Coherencia ejercicio vs fecha presentación",
    severidad: "OK",
    mensaje: `Coherente: ejercicio ${periodo}, presentado en ${anoPresentacion}`
  }
}

// M2: Ejercicio mas reciente segun campaña de la renta
export function validateEjercicioReciente(periodo: string): Modelo100Revision {
  if (!periodo || periodo === "N/D" || periodo === "N/A") {
    return {
      id: "M2",
      titulo: "Actualidad del documento",
      severidad: "ERROR",
      mensaje: "Ejercicio desactualizado o incoherente"
    }
  }
  
  const ejercicio = parseInt(periodo)
  if (isNaN(ejercicio)) {
    return {
      id: "M2",
      titulo: "Actualidad del documento",
      severidad: "ERROR",
      mensaje: "Ejercicio desactualizado o incoherente"
    }
  }
  
  const now = new Date()
  const anoActual = now.getFullYear()
  const mesActual = now.getMonth() + 1 // 1-12
  
  // Definicion de ejercicio_esperado:
  // Si mes_actual < 4 (enero, febrero, marzo): ejercicio_esperado = año_actual - 2
  // Si mes_actual >= 4: ejercicio_esperado = año_actual - 1
  const ejercicioEsperado = mesActual < 4 ? anoActual - 2 : anoActual - 1
  
  // Clasificacion:
  if (ejercicio === ejercicioEsperado) {
    return {
      id: "M2",
      titulo: "Actualidad del documento",
      severidad: "OK",
      mensaje: "Ejercicio actualizado (más reciente disponible)"
    }
  }
  
  if (ejercicio === ejercicioEsperado - 1) {
    return {
      id: "M2",
      titulo: "Actualidad del documento",
      severidad: "WARNING",
      mensaje: "Ejercicio válido pero no es el más reciente disponible"
    }
  }
  
  // ejercicio < ejercicioEsperado - 1 OR ejercicio > ejercicioEsperado
  return {
    id: "M2",
    titulo: "Actualidad del documento",
    severidad: "ERROR",
    mensaje: "Ejercicio desactualizado o incoherente"
  }
}

// M3: CSV presente y estructuralmente valido
export function validateCSV(csv: string): Modelo100Revision {
  // ERROR si CSV vacío, "N/D", "---" o null
  if (!csv || csv === "N/D" || csv === "N/A" || csv === "---" || csv.trim() === "") {
    return {
      id: "M3",
      titulo: "CSV válido",
      severidad: "ERROR",
      mensaje: "CSV ausente o inválido"
    }
  }
  
  // ERROR si CSV contiene espacios
  if (csv.includes(" ")) {
    return {
      id: "M3",
      titulo: "CSV válido",
      severidad: "ERROR",
      mensaje: "CSV ausente o inválido"
    }
  }
  
  // Validar estructura: Permitir A-Z0-9 y opcionalmente guiones "-"
  // Para validacion, ignorar guiones
  const csvSinGuiones = csv.replace(/-/g, "")
  
  // ERROR si contiene caracteres fuera de A-Z0-9
  if (!/^[A-Za-z0-9]+$/.test(csvSinGuiones)) {
    return {
      id: "M3",
      titulo: "CSV válido",
      severidad: "ERROR",
      mensaje: "CSV ausente o inválido"
    }
  }
  
  // ERROR si longitud (sin guiones) < 10
  if (csvSinGuiones.length < 10) {
    return {
      id: "M3",
      titulo: "CSV válido",
      severidad: "ERROR",
      mensaje: "CSV ausente o inválido"
    }
  }
  
  return {
    id: "M3",
    titulo: "CSV válido",
    severidad: "OK",
    mensaje: "CSV presente y válido"
  }
}

// Main function to run all Modelo 100 validations
export function runModelo100Validations(
  extractedData: Record<string, ExtractedField>
): Modelo100Revision[] {
  const revisiones: Modelo100Revision[] = []
  
  const nif = extractedData["DNI/NIF"]?.value || extractedData["NIF"]?.value || ""
  const periodo = extractedData["Periodo"]?.value || ""
  const fechaPresentacion = extractedData["Fecha de presentación"]?.value || ""
  const csv = extractedData["CSV"]?.value || ""
  
  // M0: NIF valido
  revisiones.push(validateNIF(nif))
  
  // M1: Coherencia ejercicio vs fecha presentacion
  revisiones.push(validateCoherenciaEjercicio(periodo, fechaPresentacion))
  
  // M2: Ejercicio mas reciente
  revisiones.push(validateEjercicioReciente(periodo))
  
  // M3: CSV valido
  revisiones.push(validateCSV(csv))
  
  return revisiones
}
