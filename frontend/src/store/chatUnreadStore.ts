import { create } from 'zustand'

type ChatUnreadState = {
  unread: number
  setUnread: (n: number) => void
  reset: () => void
}

export const useChatUnreadStore = create<ChatUnreadState>((set) => ({
  unread: 0,
  setUnread: (n) => set({ unread: Math.max(0, n) }),
  reset: () => set({ unread: 0 }),
}))
