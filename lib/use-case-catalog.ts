import type { UseCase } from "./types"

/**
 * Valid document types per use case.
 * Classification results are normalised to lowercase before comparison.
 */
const CATALOG: Record<UseCase, string[]> = {
  legal: [
    "escrito al juzgado",
    "diligencia de ordenación",
    "diligencia de ordenacion",
    "nota simple",
  ],
  pagos: [
    "factura",
    "factura ibi",
  ],
}

/**
 * Check whether `classifiedType` is within the catalogue of the active
 * use‑case. Comparison is case-insensitive and trimmed.
 */
export function isTypeValidForUseCase(
  classifiedType: string,
  useCase: UseCase,
): boolean {
  const normalised = classifiedType.trim().toLowerCase()
  return CATALOG[useCase].some(
    (valid) => normalised === valid || normalised.includes(valid) || valid.includes(normalised),
  )
}
