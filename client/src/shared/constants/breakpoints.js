export const BREAKPOINTS = {
  xs: '375px',    // Very narrow (iPhone, resized desktop window)
  sm: '600px',    // Small tablet/narrow desktop
  md: '768px',    // Tablet/medium desktop
  lg: '1024px',   // Large desktop
  xl: '1280px'    // Extra large desktop
}

export const MEDIA = {
  xs: `(max-width: ${BREAKPOINTS.xs})`,
  sm: `(max-width: ${BREAKPOINTS.sm})`,
  md: `(max-width: ${BREAKPOINTS.md})`,
  lg: `(max-width: ${BREAKPOINTS.lg})`,
  xl: `(max-width: ${BREAKPOINTS.xl})`
}

export const MEDIA_CSS = {
  xs: `@media (max-width: ${BREAKPOINTS.xs})`,
  sm: `@media (max-width: ${BREAKPOINTS.sm})`,
  md: `@media (max-width: ${BREAKPOINTS.md})`,
  lg: `@media (max-width: ${BREAKPOINTS.lg})`,
  xl: `@media (max-width: ${BREAKPOINTS.xl})`
}
