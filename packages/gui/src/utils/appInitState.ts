let appInitError: string | null = null;

export function setAppInitError(message: string | null): void {
  appInitError = message;
}

export function getAppInitError(): string | null {
  return appInitError;
}
