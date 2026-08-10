import { create } from 'zustand'

export type ToastVariant = 'default' | 'success' | 'error'

export type ToastItem = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

type ToastState = {
  toasts: ToastItem[]
  push: (t: Omit<ToastItem, 'id'> & { id?: string }) => string
  dismiss: (id: string) => void
}

let seq = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = t.id ?? `toast-${++seq}`
    set((s) => ({
      toasts: [...s.toasts.filter((x) => x.id !== id), { id, title: t.title, description: t.description, variant: t.variant }],
    }))
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
    }, 3200)
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

export function toast(input: {
  title: string
  description?: string
  variant?: ToastVariant
}) {
  return useToastStore.getState().push({
    title: input.title,
    description: input.description,
    variant: input.variant ?? 'default',
  })
}
