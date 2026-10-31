export type ConnectivityListener = (online: boolean) => void;

export interface ConnectivityAdapter {
  isOnline: () => boolean;
  subscribe: (listener: ConnectivityListener) => () => void;
  setOnline?: (online: boolean) => void;
  dispose?: () => void;
}

/**
 * Portable connectivity monitor supporting manual host updates (e.g. `@react-native-community/netinfo`
 * or `expo-network` bridges) as well as automatic browser `online`/`offline` events on Web.
 */
export class DefaultConnectivityAdapter implements ConnectivityAdapter {
  private online: boolean;
  private listeners = new Set<ConnectivityListener>();
  private cleanupDom?: () => void;

  constructor(initialOnline?: boolean) {
    const navOnline =
      typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
        ? navigator.onLine
        : true;
    this.online = initialOnline ?? navOnline;

    if (
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function'
    ) {
      const handleOnline = () => this.setOnline(true);
      const handleOffline = () => this.setOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      this.cleanupDom = () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }

  public isOnline(): boolean {
    return this.online;
  }

  public setOnline(nextOnline: boolean): void {
    if (this.online === nextOnline) return;
    this.online = nextOnline;
    for (const fn of this.listeners) {
      fn(this.online);
    }
  }

  public subscribe(listener: ConnectivityListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    this.cleanupDom?.();
    this.listeners.clear();
  }
}
