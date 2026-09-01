import { Package, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { gestionnaireApi, type GestionnaireLogistiquePatient } from '@/lib/api'
import { LIST_PAGE_SIZE, PaginationBar, paginateSlice } from '@/components/PaginationBar'
import { cachedFetch, hasCachedData } from '@/lib/cachedFetch'
import { queryKeys } from '@/lib/queryKeys'
import {
  LOGISTIQUE_DOCUMENT_TOTAL,
  LOGISTIQUE_ESSENTIAL_TOTAL,
  logistiqueDocumentsDoneCount,
  logistiqueEssentialsDoneCount,
  logistiqueIsComplete,
} from '@/lib/logistiqueChecklist'

export default function LogistiquePage() {
  const navigate = useNavigate()
  const [patientsLogistique, setPatientsLogistique] = useState<GestionnaireLogistiquePatient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const orderedPatients = useMemo(() => {
    return [...patientsLogistique].sort((a, b) => {
      const aDone = logistiqueEssentialsDoneCount(a.logistique)
      const bDone = logistiqueEssentialsDoneCount(b.logistique)
      const aComplete = logistiqueIsComplete(a.logistique)
      const bComplete = logistiqueIsComplete(b.logistique)
      if (aComplete !== bComplete) return aComplete ? 1 : -1
      if (aDone !== bDone) return aDone - bDone
      return a.user.fullName.localeCompare(b.user.fullName, 'fr')
    })
  }, [patientsLogistique])

  const patientsATraiter = orderedPatients.filter((p) => !logistiqueIsComplete(p.logistique))
  const patientsCompletes = orderedPatients.filter((p) => logistiqueIsComplete(p.logistique))

  const { slice: pagePatients, totalPages, page: safePage, total: listTotal } = useMemo(
    () => paginateSlice(orderedPatients, page, LIST_PAGE_SIZE),
    [orderedPatients, page],
  )
  const pageATraiter = pagePatients.filter((p) => !logistiqueIsComplete(p.logistique))
  const pageCompletes = pagePatients.filter((p) => logistiqueIsComplete(p.logistique))

  const load = async (opts?: { useCache?: boolean }) => {
    const key = queryKeys.logistique()
    const force = !opts?.useCache
    if (opts?.useCache && hasCachedData(key)) setLoading(false)
    else setLoading(true)
    setError(null)
    try {
      const res = await cachedFetch(key, () => gestionnaireApi.getLogistique(), { force })
      setPatientsLogistique(res.patients)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load({ useCache: true })
  }, [])

  const openDossierLogistique = (patientId: string) => {
    navigate(`/gestionnaire/devis/${patientId}?section=logistique`)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Logistique séjours</h2>
            <p className="text-sm text-muted-foreground">
              Cliquez sur une patiente pour ouvrir son dossier — logistique et planning au même endroit
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-amber-700 font-semibold">À traiter</p>
            <p className="text-2xl font-bold text-amber-800 mt-1">{patientsATraiter.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Complétés</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">{patientsCompletes.length}</p>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-brand-700 font-semibold">Total dossiers</p>
            <p className="text-2xl font-bold text-brand-800 mt-1">{patientsLogistique.length}</p>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {patientsLogistique.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white text-center py-16">
          <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Aucun patient avec logistique à préparer.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="space-y-2 p-4 max-h-[75vh] overflow-y-auto">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Séjours à organiser (ouvre le dossier patient)
              </p>

              {pageATraiter.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">À traiter</p>
                  {pageATraiter.map((p) => {
                    const docsDone = logistiqueDocumentsDoneCount(p.logistique?.documents)
                    const essentialsDone = logistiqueEssentialsDoneCount(p.logistique)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openDossierLogistique(p.id)}
                        className="w-full flex items-center gap-3 rounded-xl border border-border p-3 text-left transition-all hover:bg-muted/50 hover:border-brand-300"
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-purple-100 text-purple-700 text-sm font-semibold">
                            {p.user.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{p.user.fullName}</p>
                          <p className="text-xs text-muted-foreground">{p.ville ?? '—'}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand-500 rounded-full"
                                style={{ width: `${(essentialsDone / LOGISTIQUE_ESSENTIAL_TOTAL) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {docsDone}/{LOGISTIQUE_DOCUMENT_TOTAL} docs · {essentialsDone}/{LOGISTIQUE_ESSENTIAL_TOTAL}
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {pageCompletes.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Complétés</p>
                  {pageCompletes.map((p) => {
                    const docsDone = logistiqueDocumentsDoneCount(p.logistique?.documents)
                    const essentialsDone = logistiqueEssentialsDoneCount(p.logistique)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openDossierLogistique(p.id)}
                        className={cn(
                          'w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                          'border-slate-200 hover:bg-slate-50/80 hover:border-slate-300',
                        )}
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-slate-100 text-slate-700 text-sm font-semibold">
                            {p.user.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{p.user.fullName}</p>
                          <p className="text-xs text-muted-foreground">{p.ville ?? '—'}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <div className="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500/80 rounded-full" style={{ width: '100%' }} />
                            </div>
                            <span className="text-xs text-slate-600 font-medium">
                              {docsDone}/{LOGISTIQUE_DOCUMENT_TOTAL} docs · {essentialsDone}/{LOGISTIQUE_ESSENTIAL_TOTAL}
                            </span>
                          </div>
                        </div>
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Terminé
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={listTotal}
              pageSize={LIST_PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}
    </div>
  )
}
