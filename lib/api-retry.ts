export async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 1000): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      // Check if it's a retryable error (rate limit or transient server errors)
      const isRateLimitError =
        lastError.message.includes("Too Many") ||
        lastError.message.includes("429") ||
        lastError.message.includes("rate limit")

      const isTransientServerError =
        lastError.message.includes("502") ||
        lastError.message.includes("503") ||
        lastError.message.includes("504") ||
        lastError.message.includes("Bad Gateway") ||
        lastError.message.includes("Service Unavailable") ||
        lastError.message.includes("Gateway Timeout")

      const isRetryable = isRateLimitError || isTransientServerError

      if (!isRetryable || attempt === maxRetries) {
        throw lastError
      }

      // Calculate delay with exponential backoff
      const delay = initialDelay * Math.pow(2, attempt)
      const reason = isRateLimitError ? "Rate limit" : "Server error"
      console.log(`[v0] ${reason} hit, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`)

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error("Max retries exceeded")
}
