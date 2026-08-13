import { create } from 'zustand'

interface NotifUnreadState {
  unread: number
  setUnread: (n: number) => void
  reset: () => void
}

export const useNotifUnreadStore = create<NotifUnreadState>((set) => ({
  unread: 0,
  setUnread: (n) => set({ unread: Math.max(0, n) }),
  reset: () => set({ unread: 0 }),
}))
