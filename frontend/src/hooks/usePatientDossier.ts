import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import { authApi, ApiRequestError } from '@/lib/api'
import type { DossierStatus } from '@/types'

// ─── Shape renvoyée par ce hook ───────────────────────────────────────────────

export interface PatientDossierData {
  // Identité
  id: string
  prenom: string
  nom: string
  email: string
  phone: string
  // Dossier
  dossierNumber: string
  status: DossierStatus
  dateCreation: string
  derniereActivite: string
  // Optionnel
  nationalite: string | null
  ville: string | null
  pays: string | null
  sourceContact: string | null
  // Sous-ressources
  formulaire: { id: string; status: string; submittedAt: string | null } | null
  devis: { id: string; statut: string; total: number; currency: string } | null
  prochainsRdv: Array<{ id: string; date: string; heure: string; type: string; statut: string }>
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UsePatientDossierReturn {
  data: PatientDossierData | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function usePatientDossier(): UsePatientDossierReturn {
  const { user, token } = useAuthStore()
  const [data, setData] = useState<PatientDossierData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDossier = useCallback(async () => {
    if (!user || !token || user.role !== 'patient') {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [meRes, dossierRes] = await Promise.all([
        authApi.me(),
        fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'}/patient/dossier`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(async (r) => {
          const json = await r.json()
          if (!r.ok) throw new ApiRequestError(r.status, json.code, json.message)
          return json as {
            ok: true
            patient: {
              id: string
              dossierNumber: string
              phone: string | null
              dateNaissance: string | null
              nationalite: string | null
              ville: string | null
              pays: string | null
              sourceContact: string | null
              status: DossierStatus
              createdAt: string
              updatedAt: string
              formulaires: Array<{ id: string; status: string; submittedAt: string | null }>
              devis: Array<{ id: string; statut: string; total: number; currency: string }>
              rendezvous?: Array<{ id: string; date: string; heure: string; type: string; statut: string }>
              agendaEvents?: Array<{
                id: string
                dateDebut: string
                dateFin: string
                title: string | null
                motif: string | null
                statut: string | null
              }>
            }
          }
        }),
      ])

      const p = dossierRes.patient
      const nameParts = (meRes.user.name ?? '').split(' ')
      const prenom = nameParts[0] ?? ''
      const nom = nameParts.slice(1).join(' ') || ''

      const mappedRdv =
        p.rendezvous?.map((r) => ({
          id: r.id,
          date: r.date,
          heure: r.heure,
          type: r.type,
          statut: r.statut,
        })) ??
        p.agendaEvents?.map((e) => {
          const d = new Date(e.dateDebut)
          return {
            id: e.id,
            date: e.dateDebut,
            heure: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
            type: e.motif ?? e.title ?? 'RDV',
            statut: e.statut ?? 'planifie',
          }
        }) ??
        []

      setData({
        id: p.id,
        prenom,
        nom,
        email: meRes.user.email,
        phone: p.phone ?? '',
        dossierNumber: p.dossierNumber,
        status: p.status,
        dateCreation: p.createdAt,
        derniereActivite: p.updatedAt,
        nationalite: p.nationalite,
        ville: p.ville,
        pays: p.pays,
        sourceContact: p.sourceContact,
        formulaire: p.formulaires[0] ?? null,
        devis: p.devis[0] ?? null,
        prochainsRdv: mappedRdv,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement du dossier.')
    } finally {
      setLoading(false)
    }
  }, [user?.id, token])

  useEffect(() => {
    fetchDossier()
  }, [fetchDossier])

  return { data, loading, error, refresh: fetchDossier }
}
