import crypto from 'crypto'
import { google } from 'googleapis'
import type { calendar_v3 } from 'googleapis'
import { prisma } from '../../lib/prisma.js'
import { env } from '../../config/env.js'
import { AppError } from '../../middleware/errorHandler.js'
import { logger } from '../../lib/logger.js'
import type { AgendaEvent, AgendaEventType } from '@prisma/client'

const SCOPES = ['https://www.googleapis.com/auth/calendar']
const APP_PROP_EVENT_ID = 'centreEstEventId'
const APP_PROP_EVENT_TYPE = 'centreEstType'

type AgendaEventWithPatient = AgendaEvent & {
  patient?: { dossierNumber: string; user: { fullName: string } } | null
}

export function isGoogleCalendarConfigured(): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI)
}

function createOAuth2Client() {
  if (!isGoogleCalendarConfigured()) {
    throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google Calendar n’est pas configuré sur le serveur.')
  }
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  )
}

function frontendBaseUrl(): string {
  return env.FRONTEND_URL ?? 'http://localhost:5173'
}

function signState(payload: Record<string, unknown>): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

function verifyState(state: string): { medecinId: string; returnPath: string } {
  const [data, sig] = state.split('.')
  if (!data || !sig) throw new AppError(400, 'INVALID_STATE', 'État OAuth invalide.')
  const expected = crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(data).digest('base64url')
  if (sig !== expected) throw new AppError(400, 'INVALID_STATE', 'État OAuth invalide.')
  const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as {
    medecinId: string
    returnPath: string
  }
  if (!parsed.medecinId) throw new AppError(400, 'INVALID_STATE', 'État OAuth incomplet.')
  return parsed
}

export async function getConnectUrl(medecinId: string, returnPath: string): Promise<string> {
  const oauth2 = createOAuth2Client()
  const existing = await prisma.googleCalendarSync.findUnique({ where: { medecinId } })
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    // Ne redemander le consentement que lors de la première liaison.
    ...(existing?.refreshToken ? {} : { prompt: 'consent' as const }),
    scope: SCOPES,
    state: signState({ medecinId, returnPath }),
  })
}

export async function handleOAuthCallback(code: string, state: string): Promise<string> {
  const { medecinId, returnPath } = verifyState(state)
  const oauth2 = createOAuth2Client()
  const { tokens } = await oauth2.getToken(code)
  if (!tokens.refresh_token) {
    throw new AppError(
      400,
      'NO_REFRESH_TOKEN',
      'Google n’a pas renvoyé de jeton permanent. Révoquez l’accès dans votre compte Google puis reconnectez.',
    )
  }

  await prisma.googleCalendarSync.upsert({
    where: { medecinId },
    create: {
      medecinId,
      googleCalendarId: 'primary',
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token ?? null,
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
    update: {
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token ?? null,
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
  })

  void fullSync(medecinId).catch((err) => {
    logger.warn({ err, medecinId }, '[google-calendar] synchro initiale après connexion')
  })

  const base = frontendBaseUrl().replace(/\/$/, '')
  const path = returnPath.startsWith('/') ? returnPath : `/${returnPath}`
  return `${base}${path}?google=linked`
}

export async function getSyncStatus(medecinId: string) {
  if (!isGoogleCalendarConfigured()) {
    return { configured: false, linked: false }
  }
  const row = await prisma.googleCalendarSync.findUnique({ where: { medecinId } })
  return {
    configured: true,
    linked: !!row,
    googleCalendarId: row?.googleCalendarId ?? null,
    lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
  }
}

export async function disconnectGoogle(medecinId: string) {
  await prisma.googleCalendarSync.deleteMany({ where: { medecinId } })
  return { disconnected: true }
}

async function getCalendarClient(medecinId: string) {
  const sync = await prisma.googleCalendarSync.findUnique({ where: { medecinId } })
  if (!sync) return null

  const oauth2 = createOAuth2Client()
  oauth2.setCredentials({
    refresh_token: sync.refreshToken,
    access_token: sync.accessToken ?? undefined,
    expiry_date: sync.tokenExpiresAt?.getTime(),
  })

  oauth2.on('tokens', async (tokens) => {
    if (!tokens.access_token) return
    await prisma.googleCalendarSync.update({
      where: { medecinId },
      data: {
        accessToken: tokens.access_token,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      },
    })
  })

  const calendar = google.calendar({ version: 'v3', auth: oauth2 })
  return { calendar, sync }
}

function eventTitle(ev: AgendaEventWithPatient): string {
  if (ev.type === 'vacances') return ev.title?.trim() || 'Vacances — Centre Est'
  if (ev.type === 'blocage') return ev.title?.trim() || 'Créneau bloqué — Centre Est'
  const patientName = ev.patient?.user.fullName
  const dossier = ev.patient?.dossierNumber
  const parts = [patientName, ev.motif || ev.title, dossier ? `(${dossier})` : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' — ') : 'RDV — Centre Est'
}

function eventDescription(ev: AgendaEventWithPatient): string {
  const lines = [
    'Synchronisé depuis Centre Est',
    ev.type ? `Type: ${ev.type}` : null,
    ev.motif ? `Motif: ${ev.motif}` : null,
    ev.notes ? `Notes: ${ev.notes}` : null,
    ev.statut ? `Statut: ${ev.statut}` : null,
  ].filter(Boolean)
  return lines.join('\n')
}

function toGoogleEventBody(ev: AgendaEventWithPatient): calendar_v3.Schema$Event {
  const tz = 'Africa/Tunis'
  const privateProps: Record<string, string> = {
    [APP_PROP_EVENT_ID]: ev.id,
    [APP_PROP_EVENT_TYPE]: ev.type,
  }

  if (ev.allDay || ev.type === 'vacances') {
    const startDate = ev.dateDebut.toISOString().slice(0, 10)
    const endDate = new Date(ev.dateFin)
    endDate.setDate(endDate.getDate() + 1)
    return {
      summary: eventTitle(ev),
      description: eventDescription(ev),
      extendedProperties: { private: privateProps },
      start: { date: startDate },
      end: { date: endDate.toISOString().slice(0, 10) },
    }
  }

  return {
    summary: eventTitle(ev),
    description: eventDescription(ev),
    extendedProperties: { private: privateProps },
    start: { dateTime: ev.dateDebut.toISOString(), timeZone: tz },
    end: { dateTime: ev.dateFin.toISOString(), timeZone: tz },
  }
}

function mapGoogleTypeToAgenda(
  summary: string,
  allDay: boolean,
  appTypeFromProps?: string,
): AgendaEventType {
  if (appTypeFromProps === 'rdv' || appTypeFromProps === 'blocage' || appTypeFromProps === 'vacances') {
    return appTypeFromProps
  }
  const s = summary.toLowerCase()
  if (allDay || s.includes('vacance')) return 'vacances'
  if (s.includes('bloqu') || s.includes('indispon') || s.includes('blocked')) return 'blocage'
  // Événement créé dans Google (sans marqueur Centre Est) → RDV externe
  return 'rdv'
}

function parseGoogleEventTimes(g: calendar_v3.Schema$Event): {
  dateDebut: Date
  dateFin: Date
  allDay: boolean
} {
  const allDay = Boolean(g.start?.date && !g.start?.dateTime)
  const dateDebut = g.start?.dateTime
    ? new Date(g.start.dateTime)
    : new Date(`${g.start?.date ?? ''}T00:00:00`)
  const dateFin = g.end?.dateTime
    ? new Date(g.end.dateTime)
    : g.end?.date
      ? new Date(new Date(`${g.end.date}T00:00:00`).getTime() - 60_000)
      : dateDebut
  return { dateDebut, dateFin, allDay }
}

async function upsertImportedGoogleEvent(
  medecinId: string,
  g: calendar_v3.Schema$Event,
  stats: { imported: number; updated: number },
): Promise<void> {
  if (!g.id) return

  const { dateDebut, dateFin, allDay } = parseGoogleEventTimes(g)
  const summary = (g.summary ?? '').trim() || 'Importé Google Calendar'
  const appType = g.extendedProperties?.private?.[APP_PROP_EVENT_TYPE]
  const type = mapGoogleTypeToAgenda(summary, allDay, appType)

  const existing = await prisma.agendaEvent.findFirst({ where: { googleEventId: g.id } })

  if (existing) {
    if (existing.medecinId !== medecinId) return
    if (existing.lastSyncedFrom === 'app') {
      const age = Date.now() - existing.updatedAt.getTime()
      if (age < 8000) return
    }
    await prisma.agendaEvent.update({
      where: { id: existing.id },
      data: {
        type,
        title: summary,
        dateDebut,
        dateFin,
        allDay,
        lastSyncedFrom: 'google',
        notes: g.description ?? existing.notes,
        ...(type === 'rdv' && !existing.statut ? { statut: 'confirme' } : {}),
      },
    })
    stats.updated++
    return
  }

  try {
    await prisma.agendaEvent.create({
      data: {
        medecinId,
        type,
        title: summary,
        dateDebut,
        dateFin,
        allDay,
        googleEventId: g.id,
        lastSyncedFrom: 'google',
        notes: g.description ?? null,
        statut: type === 'rdv' ? 'confirme' : null,
        motif: type === 'rdv' ? (g.description?.split('\n')[0]?.trim() || null) : null,
      },
    })
    stats.imported++
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code !== 'P2002') {
      logger.warn({ err, googleEventId: g.id }, '[google-calendar] import create skipped')
      return
    }
    const dup = await prisma.agendaEvent.findFirst({ where: { googleEventId: g.id } })
    if (dup?.medecinId !== medecinId) return
    await prisma.agendaEvent.update({
      where: { id: dup.id },
      data: {
        type,
        title: summary,
        dateDebut,
        dateFin,
        allDay,
        lastSyncedFrom: 'google',
      },
    })
    stats.updated++
  }
}

async function loadEventWithPatient(eventId: string): Promise<AgendaEventWithPatient | null> {
  return prisma.agendaEvent.findUnique({
    where: { id: eventId },
    include: {
      patient: { include: { user: { select: { fullName: true } } } },
    },
  })
}

export async function pushEventToGoogle(eventId: string): Promise<boolean> {
  if (!isGoogleCalendarConfigured()) return false

  const ev = await loadEventWithPatient(eventId)
  if (!ev) return false

  const client = await getCalendarClient(ev.medecinId)
  if (!client) return false

  const body = toGoogleEventBody(ev)

  try {
    if (ev.googleEventId) {
      await client.calendar.events.update({
        calendarId: client.sync.googleCalendarId,
        eventId: ev.googleEventId,
        requestBody: body,
      })
      await prisma.agendaEvent.update({
        where: { id: ev.id },
        data: { lastSyncedFrom: 'app' },
      })
      return true
    }

    const created = await client.calendar.events.insert({
      calendarId: client.sync.googleCalendarId,
      requestBody: body,
    })

    if (created.data.id) {
      await prisma.agendaEvent.update({
        where: { id: ev.id },
        data: { googleEventId: created.data.id, lastSyncedFrom: 'app' },
      })
      return true
    }
    return false
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error({ err, eventId, medecinId: ev.medecinId }, `[google-calendar] push failed: ${msg}`)
    return false
  }
}

/** Envoie vers Google tous les événements locaux sans googleEventId (RDV/blocages déjà créés avant la liaison). */
export async function pushAllEventsToGoogle(medecinId: string): Promise<{ pushed: number; failed: number }> {
  if (!isGoogleCalendarConfigured()) return { pushed: 0, failed: 0 }

  const events = await prisma.agendaEvent.findMany({
    where: { medecinId, googleEventId: null },
    include: {
      patient: { include: { user: { select: { fullName: true } } } },
    },
  })

  let pushed = 0
  let failed = 0
  for (const ev of events) {
    const ok = await pushEventToGoogle(ev.id)
    if (ok) pushed++
    else failed++
  }
  logger.info({ medecinId, pushed, failed }, '[google-calendar] push all done')
  return { pushed, failed }
}

export async function deleteEventFromGoogle(medecinId: string, googleEventId: string | null): Promise<void> {
  if (!googleEventId || !isGoogleCalendarConfigured()) return
  const client = await getCalendarClient(medecinId)
  if (!client) return
  try {
    await client.calendar.events.delete({
      calendarId: client.sync.googleCalendarId,
      eventId: googleEventId,
    })
  } catch (err) {
    console.error('[google-calendar] delete failed', googleEventId, err)
  }
}

export async function pullFromGoogle(medecinId: string): Promise<{ imported: number; updated: number; removed: number }> {
  const stats = { imported: 0, updated: 0, removed: 0 }
  if (!isGoogleCalendarConfigured()) return stats

  const client = await getCalendarClient(medecinId)
  if (!client) return stats

  const timeMin = new Date()
  timeMin.setMonth(timeMin.getMonth() - 3)
  const timeMax = new Date()
  timeMax.setMonth(timeMax.getMonth() + 12)

  const googleIds = new Set<string>()
  let pageToken: string | undefined

  do {
    const res = await client.calendar.events.list({
      calendarId: client.sync.googleCalendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      pageToken,
    })

    for (const g of res.data.items ?? []) {
      if (!g.id || g.status === 'cancelled') continue
      googleIds.add(g.id)

      const appId = g.extendedProperties?.private?.[APP_PROP_EVENT_ID]
      const { dateDebut, dateFin, allDay } = parseGoogleEventTimes(g)
      const summary = (g.summary ?? '').trim() || 'Importé Google Calendar'
      const appType = g.extendedProperties?.private?.[APP_PROP_EVENT_TYPE]

      if (appId) {
        const existing = await prisma.agendaEvent.findFirst({
          where: { id: appId, medecinId },
        })
        if (existing?.lastSyncedFrom === 'app') {
          const age = Date.now() - existing.updatedAt.getTime()
          if (age < 8000) continue
        }
        if (existing) {
          const type = mapGoogleTypeToAgenda(summary, allDay, appType)
          await prisma.agendaEvent.update({
            where: { id: appId },
            data: {
              googleEventId: g.id,
              type,
              title: summary,
              dateDebut,
              dateFin,
              allDay,
              lastSyncedFrom: 'google',
            },
          })
          stats.updated++
          continue
        }
      }

      await upsertImportedGoogleEvent(medecinId, g, stats)
    }

    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  const linked = await prisma.agendaEvent.findMany({
    where: {
      medecinId,
      googleEventId: { not: null },
      dateDebut: { gte: timeMin, lte: timeMax },
    },
  })

  for (const local of linked) {
    if (!local.googleEventId) continue
    if (googleIds.has(local.googleEventId)) continue
    if (local.lastSyncedFrom === 'app') {
      const age = Date.now() - local.updatedAt.getTime()
      if (age < 8000) continue
    }
    await prisma.agendaEvent.delete({ where: { id: local.id } })
    stats.removed++
  }

  await prisma.googleCalendarSync.update({
    where: { medecinId },
    data: { lastSyncAt: new Date() },
  })

  return stats
}

export type FullSyncResult = {
  pushed: number
  failed: number
  imported: number
  updated: number
  removed: number
}

/** Synchronisation bidirectionnelle complète (app → Google puis Google → app). */
export async function fullSync(medecinId: string): Promise<FullSyncResult> {
  const push = await pushAllEventsToGoogle(medecinId)
  const pull = await pullFromGoogle(medecinId)
  return { ...push, ...pull }
}

const autoSyncLastRun = new Map<string, number>()
const AUTO_SYNC_DEBOUNCE_MS = 45_000

/** Lance une synchro en arrière-plan (debounce pour éviter les rafales). */
export function triggerAutoSync(medecinId: string): void {
  if (!isGoogleCalendarConfigured() || !medecinId) return
  const now = Date.now()
  const last = autoSyncLastRun.get(medecinId) ?? 0
  if (now - last < AUTO_SYNC_DEBOUNCE_MS) return
  autoSyncLastRun.set(medecinId, now)
  void fullSync(medecinId)
    .then((r) => {
      logger.debug({ medecinId, ...r }, '[google-calendar] auto-sync ok')
    })
    .catch((err) => {
      logger.warn({ err, medecinId }, '[google-calendar] auto-sync failed')
      autoSyncLastRun.delete(medecinId)
    })
}
