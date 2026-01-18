// Centralized query keys for React Query
export const queryKeys = {
  matches: {
    all: ['matches'] as const,
    open: (filters?: object) => [...queryKeys.matches.all, 'open', filters] as const,
    my: (userId: string) => [...queryKeys.matches.all, 'my', userId] as const,
    detail: (id: string) => [...queryKeys.matches.all, 'detail', id] as const,
  },
  teams: {
    all: ['teams'] as const,
    my: (userId: string) => [...queryKeys.teams.all, 'my', userId] as const,
    detail: (id: string) => [...queryKeys.teams.all, 'detail', id] as const,
  },
  wallet: (userId: string) => ['wallet', userId] as const,
  profile: (userId: string) => ['profile', userId] as const,
  transactions: (userId: string) => ['transactions', userId] as const,
  notifications: (userId: string) => ['notifications', userId] as const,
};
