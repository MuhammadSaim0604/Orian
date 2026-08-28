import { createElement, type ReactNode } from 'react';
import { Pressable, Text, View, type PressableProps } from 'react-native';

/**
 * Button.
 *
 * Variants are named by intent rather than by colour, so a screen asks for a `danger`
 * action and the theme decides what that looks like. That is what lets light and dark
 * work without touching a component (ADR 0004).
 *
 * Accessibility is not optional here: a `Pressable` with no role and no label is
 * invisible to a screen reader, and this app asks users to hand over control of their
 * phone - they have to be able to tell what a button will do.
 */

export const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger'] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const BUTTON_SIZES = ['sm', 'md', 'lg'] as const;

export type ButtonSize = (typeof BUTTON_SIZES)[number];

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Stretches to fill its row. */
  readonly full?: boolean;
  /** Shown instead of the label while an action is in flight. */
  readonly busyLabel?: string;
  readonly busy?: boolean;
  readonly leading?: ReactNode;
}

const CONTAINER: Record<ButtonVariant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-surface-muted border border-border',
  ghost: 'bg-transparent',
  danger: 'bg-transparent border border-danger',
};

const LABEL: Record<ButtonVariant, string> = {
  primary: 'text-text-on-primary',
  secondary: 'text-text-primary',
  ghost: 'text-primary',
  danger: 'text-danger',
};

const PADDING: Record<ButtonSize, string> = {
  sm: 'px-3 py-2',
  md: 'px-4 py-3',
  lg: 'px-5 py-4',
};

const LABEL_SIZE: Record<ButtonSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export const Button = ({
  label,
  variant = 'primary',
  size = 'md',
  full = false,
  busy = false,
  busyLabel,
  leading,
  disabled,
  accessibilityLabel,
  ...rest
}: ButtonProps) => {
  // Busy counts as disabled: a second tap on a button that is already working is almost
  // always an accident, and on this canvas it could start a second workflow run.
  const inactive = disabled === true || busy;

  return createElement(
    Pressable,
    {
      ...rest,
      disabled: inactive,
      accessibilityRole: 'button',
      // Falls back to the visible label, so a button is never unlabelled to a screen
      // reader.
      accessibilityLabel: accessibilityLabel ?? label,
      accessibilityState: { disabled: inactive, busy },
      className: [
        'flex-row items-center justify-center rounded-lg',
        PADDING[size],
        inactive ? 'bg-surface-muted border border-border' : CONTAINER[variant],
        full ? 'flex-1' : '',
      ].join(' '),
    },
    leading == null ? null : createElement(View, { className: 'mr-2' }, leading),
    createElement(
      Text,
      {
        className: [
          'font-semibold',
          LABEL_SIZE[size],
          inactive ? 'text-text-muted' : LABEL[variant],
        ].join(' '),
      },
      busy ? (busyLabel ?? label) : label,
    ),
  );
};
