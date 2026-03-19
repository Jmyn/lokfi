// Shared Recharts styling constants for the dashboard.
// Centralises tooltip, axis, and container styles so every chart is visually consistent.

export const AXIS_TICK = {
  fontSize: 11,
  fontFamily: 'DM Mono',
  fill: '#9ca3af',
} as const

export const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: '8px',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--bg)',
  fontFamily: 'DM Mono',
  fontSize: '12px',
}

export const CURSOR_STYLE = { fill: 'rgba(0,0,0,0.04)' }

export const LEGEND_STYLE: React.CSSProperties = {
  fontSize: '12px',
  fontFamily: 'DM Sans',
}
