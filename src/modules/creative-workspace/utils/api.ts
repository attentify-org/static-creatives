export async function postForm<T>(
  url: string,
  formData: FormData,
  init?: Omit<RequestInit, 'method' | 'body'>,
): Promise<T> {
  const res = await fetch(url, { ...init, method: 'POST', body: formData })
  return parseJsonResponse<T>(res)
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  return parseJsonResponse<T>(res)
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text()
  const data = parseJson(text)

  if (!res.ok) {
    const message = getErrorMessage(data, text, res.status)
    throw new Error(message)
  }

  if (!data) {
    throw new Error(`Request succeeded but returned an empty response (${res.status})`)
  }

  return data as T
}

function parseJson(text: string) {
  if (!text.trim()) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function getErrorMessage(data: unknown, text: string, status: number) {
  if (isErrorObject(data)) return data.error

  const trimmed = text.trim()
  if (trimmed) return `Request failed (${status}): ${trimmed.slice(0, 300)}`

  return `Request failed with empty response (${status})`
}

function isErrorObject(value: unknown): value is { error: string } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'error' in value &&
    typeof (value as { error?: unknown }).error === 'string',
  )
}
