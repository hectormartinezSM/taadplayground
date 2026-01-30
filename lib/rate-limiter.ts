class RateLimiter {
  private queue: Array<() => Promise<any>> = []
  private running = 0
  private maxConcurrent: number
  private minDelay: number
  private lastCallTime = 0

  constructor(maxConcurrent = 2, minDelay = 500) {
    this.maxConcurrent = maxConcurrent
    this.minDelay = minDelay
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          // Ensure minimum delay between calls
          const now = Date.now()
          const timeSinceLastCall = now - this.lastCallTime
          if (timeSinceLastCall < this.minDelay) {
            await new Promise((r) => setTimeout(r, this.minDelay - timeSinceLastCall))
          }

          this.lastCallTime = Date.now()
          const result = await fn()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })

      this.processQueue()
    })
  }

  private async processQueue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return
    }

    this.running++
    const task = this.queue.shift()

    if (task) {
      await task()
      this.running--
      this.processQueue()
    }
  }
}

// Global rate limiter instance for API calls
export const apiRateLimiter = new RateLimiter(4, 300) // Max 4 concurrent, 300ms between calls

// Faster rate limiter for non-LandingAI calls
export const fastRateLimiter = new RateLimiter(6, 100) // Max 6 concurrent, 100ms between calls
