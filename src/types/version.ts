export interface VersionInfo {
  buildTimestamp: string;
  githubRunId: string | null;
  shortVersion: string;
}

// Global type declaration for Vite-injected version
declare global {
  const __APP_VERSION__: VersionInfo;
}