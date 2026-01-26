export async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 1000): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      // Check if it's a rate limit error
      const isRateLimitError =
        lastError.message.includes("Too Many") ||
        lastError.message.includes("429") ||
        lastError.message.includes("rate limit")

      if (!isRateLimitError || attempt === maxRetries) {
        throw lastError
      }

      // Calculate delay with exponential backoff
      const delay = initialDelay * Math.pow(2, attempt)
      console.log(`[v0] Rate limit hit, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`)

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error("Max retries exceeded")
}
