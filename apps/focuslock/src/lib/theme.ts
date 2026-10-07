/**
 * FocusLock Design System — Dynamic Glassmorphism Theme
 * Single source of truth for colors, typography, radii, shadows, and spacing.
 * Supports Light, Dark, and System/Automatic modes.
 */
import { Platform } from 'react-native';

// ─── Dark Mode Palette ──────────────────────────────────────────────────────
export const darkColors = {
  // Canvas & Backgrounds
  bg:            '#070B14',       // Deepest dark canvas
  bgSecondary:   '#0D1424',       // Slightly elevated dark surface
  bgCard:        'rgba(255,255,255,0.06)',
  bgCardSolid:   '#0E1626',
  bgCardHover:   'rgba(255,255,255,0.10)',
  bgNav:         'rgba(12,18,32,0.92)',
  bgInput:       'rgba(255,255,255,0.06)',
  bgModal:       '#0E1425',

  // Borders / Strokes
  border:        'rgba(255,255,255,0.12)',
  borderLight:   'rgba(255,255,255,0.18)',
  borderStrong:  'rgba(255,255,255,0.28)',

  // Typography
  textPrimary:   '#F0F4FF',
  textSecondary: '#8A93A8',
  textMuted:     '#545C70',
  textAccent:    '#76F756',

  // Brand / Accents (Neon green + glassy teal from logo!)
  accent:        '#76F756',       // Electric neon green from FocusLock logo
  accentGlow:    'rgba(118,247,86,0.35)',
  accentDim:     'rgba(118,247,86,0.14)',
  accentSecond:  '#10B981',       // Teal

  // Semantic States
  danger:        '#F87171',
  dangerDim:     'rgba(248,113,113,0.14)',
  warning:       '#FBBF24',
  warningDim:    'rgba(251,191,36,0.14)',
  success:       '#76F756',
  successDim:    'rgba(118,247,86,0.14)',

  // Ambient / Glass
  orbGreen:      'rgba(118,247,86,0.20)',
  orbTeal:       'rgba(16,185,129,0.14)',
  orbBlue:       'rgba(14,165,233,0.10)',
  orbViolet:     'rgba(124,58,237,0.10)',
  orbCyan:       'rgba(6,182,212,0.10)',

  white:         '#FFFFFF',
  black:         '#000000',
  transparent:   'transparent',
};

// ─── Light Mode Palette ─────────────────────────────────────────────────────
export const lightColors = {
  // Canvas & Backgrounds
  bg:            '#F8FAFC',       // Clean slate canvas
  bgSecondary:   '#EDF2F7',       // Elevated surface
  bgCard:        'rgba(255,255,255,0.90)',
  bgCardSolid:   '#FFFFFF',
  bgCardHover:   '#F1F5F9',
  bgNav:         'rgba(255,255,255,0.92)',
  bgInput:       '#F1F5F9',
  bgModal:       '#FFFFFF',

  // Borders / Strokes
  border:        'rgba(0,0,0,0.07)',
  borderLight:   'rgba(0,0,0,0.10)',
  borderStrong:  'rgba(0,0,0,0.18)',

  // Typography
  textPrimary:   '#0F172A',
  textSecondary: '#475569',
  textMuted:     '#94A3B8',
  textAccent:    '#2563EB',

  // Brand / Accents
  accent:        '#2563EB',       // Vivid royal blue
  accentGlow:    'rgba(37,99,235,0.18)',
  accentDim:     'rgba(37,99,235,0.08)',
  accentSecond:  '#7C3AED',       // Purple

  // Semantic States
  danger:        '#EF4444',
  dangerDim:     'rgba(239,68,68,0.10)',
  warning:       '#F59E0B',
  warningDim:    'rgba(245,158,11,0.10)',
  success:       '#10B981',
  successDim:    'rgba(16,185,129,0.10)',

  // Ambient / Glass
  orbGreen:      'rgba(118,247,86,0.10)',
  orbTeal:       'rgba(16,185,129,0.08)',
  orbBlue:       'rgba(37,99,235,0.08)',
  orbViolet:     'rgba(124,58,237,0.06)',
  orbCyan:       'rgba(6,182,212,0.06)',

  white:         '#FFFFFF',
  black:         '#000000',
  transparent:   'transparent',
};

export type ThemeColors = typeof darkColors;

// Default export C points to dark for backwards compatibility
export const C: ThemeColors = darkColors;

export function getThemeColors(isDark: boolean): ThemeColors {
  return isDark ? darkColors : lightColors;
}

// ─── Border Radii ──────────────────────────────────────────────────────────
export const R = {
  xs:   8,
  sm:   12,
  md:   16,
  lg:   20,
  xl:   24,
  xxl:  32,
  pill: 999,
};

// ─── Spacing ───────────────────────────────────────────────────────────────
export const S = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
};

// ─── Typography Presets ────────────────────────────────────────────────────
export const T = {
  hero:    { fontSize: 32, fontWeight: '800' as const, letterSpacing: -1.0 },
  h1:      { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.7 },
  h2:      { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.4 },
  h3:      { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.3 },
  body:    { fontSize: 15, fontWeight: '400' as const },
  bodyMed: { fontSize: 15, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  label:   { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.0, textTransform: 'uppercase' as const },
};

// ─── Dynamic Glass Card Shadow ─────────────────────────────────────────────
export function getGlassCardShadow(isDark: boolean) {
  return Platform.select({
    ios: isDark
      ? {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.36,
          shadowRadius: 20,
        }
      : {
          shadowColor: '#64748B',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 14,
        },
    android: {
      elevation: isDark ? 6 : 3,
    },
    web: isDark
      ? ({
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
        } as any)
      : ({
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
        } as any),
  });
}

// ─── Dynamic Glass Nav Shadow ──────────────────────────────────────────────
export function getGlassNavShadow(isDark: boolean) {
  return Platform.select({
    ios: isDark
      ? {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.45,
          shadowRadius: 24,
        }
      : {
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.10,
          shadowRadius: 18,
        },
    android: {
      elevation: isDark ? 10 : 6,
    },
    web: isDark
      ? ({
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          boxShadow: '0 12px 36px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.10)',
        } as any)
      : ({
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
        } as any),
  });
}

export const glassCardShadow = getGlassCardShadow(true);
export const glassNavShadow = getGlassNavShadow(true);
