import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export interface SubmissionDocument {
  type: string
  pageCount: number
  extractedFields: Record<string, { value: string; confidence: number }>
  thumbnailUrl?: string
}

export interface Submission {
  id: string
  createdAt: string
  documents: SubmissionDocument[]
  totalPages: number
  status: 'completed' | 'error'
}

const SUBMISSIONS_KEY = 'iberdrola:submissions'
const SUBMISSION_PREFIX = 'iberdrola:submission:'

// Save a new submission
export async function saveSubmission(submission: Omit<Submission, 'id' | 'createdAt'>): Promise<Submission> {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  
  const fullSubmission: Submission = {
    id,
    createdAt,
    ...submission,
  }
  
  // Store the submission details
  await redis.set(`${SUBMISSION_PREFIX}${id}`, JSON.stringify(fullSubmission))
  
  // Add to the list of submissions (sorted by date, newest first)
  await redis.lpush(SUBMISSIONS_KEY, id)
  
  // Keep only last 100 submissions
  await redis.ltrim(SUBMISSIONS_KEY, 0, 99)
  
  return fullSubmission
}

// Get all submissions (paginated)
export async function getSubmissions(limit = 20, offset = 0): Promise<Submission[]> {
  const ids = await redis.lrange(SUBMISSIONS_KEY, offset, offset + limit - 1)
  
  if (!ids || ids.length === 0) {
    return []
  }
  
  const submissions: Submission[] = []
  
  for (const id of ids) {
    const data = await redis.get(`${SUBMISSION_PREFIX}${id}`)
    if (data) {
      submissions.push(typeof data === 'string' ? JSON.parse(data) : data as Submission)
    }
  }
  
  return submissions
}

// Get a single submission by ID
export async function getSubmission(id: string): Promise<Submission | null> {
  const data = await redis.get(`${SUBMISSION_PREFIX}${id}`)
  if (!data) return null
  return typeof data === 'string' ? JSON.parse(data) : data as Submission
}

// Delete a submission
export async function deleteSubmission(id: string): Promise<boolean> {
  await redis.del(`${SUBMISSION_PREFIX}${id}`)
  await redis.lrem(SUBMISSIONS_KEY, 1, id)
  return true
}
