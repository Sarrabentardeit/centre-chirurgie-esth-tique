import { MOCK_CREDENTIALS, MOCK_USERS } from './data'
import type { User } from '@/types'

export interface LoginResult {
  success: boolean
  user?: User
  token?: string
  error?: string
}

type PersistedAuthAccount = {
  user: User
  password: string
}

const AUTH_STORAGE_KEY = 'mock-auth-accounts-v1'

function getPersistedAccounts(): PersistedAuthAccount[] {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PersistedAuthAccount[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function setPersistedAccounts(accounts: PersistedAuthAccount[]) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(accounts))
}

function emailExists(email: string) {
  const key = email.toLowerCase().trim()
  const inMock = Boolean(MOCK_CREDENTIALS[key])
  const inPersisted = getPersistedAccounts().some((a) => a.user.email.toLowerCase() === key)
  return inMock || inPersisted
}

export function registerMockAccount(user: User, password: string): { success: boolean; error?: string } {
  const email = user.email.toLowerCase().trim()
  if (emailExists(email)) {
    return { success: false, error: 'Un compte avec cet email existe déjà.' }
  }

  const accounts = getPersistedAccounts()
  accounts.push({
    user: { ...user, email },
    password,
  })
  setPersistedAccounts(accounts)
  return { success: true }
}

export async function mockLogin(email: string, password: string): Promise<LoginResult> {
  await new Promise((resolve) => setTimeout(resolve, 800))

  const normalizedEmail = email.toLowerCase().trim()
  const creds = MOCK_CREDENTIALS[normalizedEmail]

  if (creds) {
    if (creds.password !== password) {
      return { success: false, error: 'Mot de passe incorrect.' }
    }

    const user = MOCK_USERS.find((u) => u.id === creds.userId)

    if (!user) {
      return { success: false, error: 'Erreur de compte.' }
    }

    return {
      success: true,
      user,
      token: `mock-token-${user.id}-${Date.now()}`,
    }
  }

  const persisted = getPersistedAccounts().find((a) => a.user.email.toLowerCase() === normalizedEmail)
  if (!persisted) {
    return { success: false, error: 'Adresse email introuvable.' }
  }

  if (persisted.password !== password) {
    return { success: false, error: 'Mot de passe incorrect.' }
  }

  return {
    success: true,
    user: persisted.user,
    token: `mock-token-${persisted.user.id}-${Date.now()}`,
  }
}
