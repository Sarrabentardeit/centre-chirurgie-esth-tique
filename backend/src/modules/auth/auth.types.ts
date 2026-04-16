export type UserRole = 'patient' | 'medecin' | 'gestionnaire'

export interface JwtPayload {
  sub: string
  email: string
  role: UserRole
  iat: number
  exp: number
}

export interface RefreshPayload {
  sub: string
  type: 'refresh'
  iat: number
  exp: number
}
