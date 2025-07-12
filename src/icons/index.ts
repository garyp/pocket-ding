// Central icon registry - explicitly list icons used in the application
// This allows the build system to only copy the icons we actually use
//
// IMPORTANT: Icons MUST be registered here to be included in the build.
// The build system does NOT scan for icons automatically.
//
// To add a new icon:
// 1. Add the icon name to the REQUIRED_ICONS array below
// 2. Use it in your component: <sl-icon name="icon-name"></sl-icon>
// 3. The build system will automatically copy it to the dist folder
//
// Find available icons at: https://shoelace.style/components/icon

// Explicit list of icons used in the application
export const REQUIRED_ICONS = [
  'archive',
  'arrow-clockwise', 
  'arrow-left',
  'arrow-repeat',
  'box-arrow-up-right',
  'circle-half',
  'download',
  'envelope',
  'envelope-open',
  'gear',
  'info-circle',
  'lightbulb',
  'moon-fill',
  'sun-fill',
  'wifi-off',
] as const;

export type IconName = typeof REQUIRED_ICONS[number];

// Register icons with Shoelace at startup
export function registerIcons() {
  // Icons are served via the base path, no additional registration needed
  // The Shoelace base path handles icon resolution automatically
}

// Get the list of registered icon names (for build tooling)
export function getRegisteredIconNames(): string[] {
  return [...REQUIRED_ICONS];
}