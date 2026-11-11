const TOKEN_KEY = 'kopeyka.token'

export const tokenStorage = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null // private mode / storage disabled: user simply logs in again
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* see get() */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* see get() */
    }
  },
}

export const UNAUTHORIZED_EVENT = 'kopeyka:unauthorized'

export class ApiError extends Error {
  readonly status: number
  readonly data: unknown

  constructor(status: number, data: unknown) {
    super(describeError(data) ?? `Ошибка сервера (${status})`)
    this.status = status
    this.data = data
  }

  /** Error text for one form field, if the backend returned one. */
  field(name: string): string | undefined {
    if (this.data && typeof this.data === 'object' && name in this.data) {
      return describeError((this.data as Record<string, unknown>)[name])
    }
    return undefined
  }
}

/** DRF returns errors as {"field": ["msg"]}, {"detail": "msg"} or ["msg"]. */
export function describeError(data: unknown): string | undefined {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return data.map(describeError).filter(Boolean).join(' ')
  if (data && typeof data === 'object') {
    const values = Object.values(data as Record<string, unknown>)
    return values.map(describeError).filter(Boolean)[0]
  }
  return undefined
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  form?: FormData
  signal?: AbortSignal
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = tokenStorage.get()
  if (token) headers.Authorization = `Token ${token}`

  let body: BodyInit | undefined
  if (options.form) {
    body = options.form // browser sets multipart boundary itself
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.')
  }

  if (response.status === 401) {
    tokenStorage.clear()
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  }
  if (response.status === 204) return undefined as T

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data: unknown = isJson ? await response.json() : await response.text()
  if (!response.ok) {
    throw new ApiError(response.status, isJson ? data : undefined)
  }
  return data as T
}

export function toQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}
