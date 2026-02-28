"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

export type Locale = "es" | "en"

interface LocaleContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (es: string, en: string) => string
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en")

  const t = (es: string, en: string) => (locale === "en" ? en : es)

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) {
    // Fallback for components used outside provider (e.g. mobile-upload)
    return {
      locale: "es" as Locale,
      setLocale: () => {},
      t: (es: string, _en: string) => es,
    }
  }
  return context
}
