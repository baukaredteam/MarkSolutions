const KEY = "markflow.session";

export interface Session {
  tenantId: string;
  token: string;
}

export const sessionStore = {
  get(): Session | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  },
  set(s: Session): void {
    localStorage.setItem(KEY, JSON.stringify(s));
  },
  clear(): void {
    localStorage.removeItem(KEY);
  },
};
