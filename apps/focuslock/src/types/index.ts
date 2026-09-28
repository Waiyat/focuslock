// Types and models placeholder for FocusLock domain entities (Apps, Limits, Sessions, User)
export interface AppLimit {
  id: string;
  appIdentifier: string;
  appName: string;
  dailyLimitMinutes: number;
  usedMinutesToday: number;
  isLocked: boolean;
}

export interface UserSession {
  userId: string;
  email: string;
  isAuthenticated: boolean;
}
