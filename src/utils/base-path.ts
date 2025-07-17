/**
 * Utility function to get the base path for the application.
 * Uses Vite's import.meta.env.BASE_URL or defaults to '/'.
 * This is used for both routing and asset path resolution.
 */
export function getBasePath(): string {
  return (import.meta.env && import.meta.env.BASE_URL) || '/';
}