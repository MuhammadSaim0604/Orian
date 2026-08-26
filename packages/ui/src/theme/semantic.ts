/**
 * Semantic tokens: meaning mapped to raw palette values, per colour scheme.
 *
 * Components reference these names (`surface`, `primary`, `textPrimary`) rather
 * than raw hex values, which is what makes light/dark and future re-theming
 * possible without editing components (ADR 0004).
 */

import { palette } from './tokens';

/** Every semantic colour role the product uses. */
export interface SemanticColors {
  /** App background, behind everything. */
  readonly background: string;
  /** Cards, sheets, panels sitting on the background. */
  readonly surface: string;
  /** A surface that needs to sit above another surface. */
  readonly surfaceRaised: string;
  /** Subtle fills: input backgrounds, hover states. */
  readonly surfaceMuted: string;

  readonly border: string;
  readonly borderStrong: string;

  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  /** Text drawn on top of a `primary` fill. */
  readonly textOnPrimary: string;

  readonly primary: string;
  readonly primaryHover: string;
  readonly primaryMuted: string;

  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly info: string;

  /** Workflow canvas: grid lines, node bodies, edges, selection. */
  readonly canvasBackground: string;
  readonly canvasGrid: string;
  readonly nodeSurface: string;
  readonly nodeBorder: string;
  readonly nodeSelected: string;
  readonly edge: string;
  readonly edgeActive: string;
}

export const lightColors: SemanticColors = {
  background: palette.slate50,
  surface: palette.white,
  surfaceRaised: palette.white,
  surfaceMuted: palette.slate100,

  border: palette.slate200,
  borderStrong: palette.slate300,

  textPrimary: palette.slate900,
  textSecondary: palette.slate600,
  textMuted: palette.slate400,
  textOnPrimary: palette.white,

  primary: palette.indigo600,
  primaryHover: palette.indigo700,
  primaryMuted: palette.indigo300,

  success: palette.emerald600,
  warning: palette.amber500,
  danger: palette.red600,
  info: palette.cyan400,

  canvasBackground: palette.slate100,
  canvasGrid: palette.slate200,
  nodeSurface: palette.white,
  nodeBorder: palette.slate300,
  nodeSelected: palette.indigo500,
  edge: palette.slate400,
  edgeActive: palette.indigo500,
};

export const darkColors: SemanticColors = {
  background: palette.slate950,
  surface: palette.slate900,
  surfaceRaised: palette.slate800,
  surfaceMuted: palette.slate800,

  border: palette.slate700,
  borderStrong: palette.slate600,

  textPrimary: palette.slate50,
  textSecondary: palette.slate300,
  textMuted: palette.slate500,
  textOnPrimary: palette.white,

  primary: palette.indigo400,
  primaryHover: palette.indigo300,
  primaryMuted: palette.indigo700,

  success: palette.emerald400,
  warning: palette.amber400,
  danger: palette.red400,
  info: palette.cyan400,

  canvasBackground: palette.slate950,
  canvasGrid: palette.slate800,
  nodeSurface: palette.slate800,
  nodeBorder: palette.slate600,
  nodeSelected: palette.indigo400,
  edge: palette.slate600,
  edgeActive: palette.indigo400,
};

export const semanticColors = {
  light: lightColors,
  dark: darkColors,
} as const;

export type ColorSchemeName = keyof typeof semanticColors;
