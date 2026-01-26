// Global session storage that persists across requests
type SessionData = {
  createdAt: Date
  fileId?: string
  fileName?: string
  fileType?: string
}

// Use globalThis to ensure persistence across hot reloads
const getSessionStore = () => {
  if (typeof globalThis === "undefined") {
    return new Map<string, SessionData>()
  }

  if (!(globalThis as any).__sessionStore) {
    ;(globalThis as any).__sessionStore = new Map<string, SessionData>()
    console.log("[v0] Initialized global session store")
  }

  return (globalThis as any).__sessionStore as Map<string, SessionData>
}

// Clean up old sessions (older than 1 hour)
export function cleanupOldSessions() {
  const store = getSessionStore()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  let cleaned = 0

  for (const [sessionId, session] of store.entries()) {
    if (session.createdAt < oneHourAgo) {
      store.delete(sessionId)
      cleaned++
    }
  }

  if (cleaned > 0) {
    console.log(`[v0] Cleaned up ${cleaned} old sessions`)
  }
}

export function createSession(sessionId: string): void {
  const store = getSessionStore()
  store.set(sessionId, {
    createdAt: new Date(),
  })
  console.log(`[v0] Created session: ${sessionId}, Total sessions: ${store.size}`)
}

export function getSession(sessionId: string): SessionData | undefined {
  const store = getSessionStore()
  const session = store.get(sessionId)
  console.log(`[v0] Getting session ${sessionId}:`, session ? "found" : "not found", `Total sessions: ${store.size}`)
  return session
}

export function updateSession(sessionId: string, data: Partial<SessionData>): boolean {
  const store = getSessionStore()
  const session = store.get(sessionId)

  if (!session) {
    console.log(`[v0] Cannot update session ${sessionId}: not found`)
    return false
  }

  store.set(sessionId, {
    ...session,
    ...data,
  })

  console.log(`[v0] Updated session ${sessionId}`)
  return true
}

export function getAllSessions(): Map<string, SessionData> {
  return getSessionStore()
}
