import { createElement, type ReactNode } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/**
 * Form primitives.
 *
 * Built here rather than in the app because the schema-driven node form needs them, and
 * `packages/ui` must not depend on the app. Each carries its own label and error text, so
 * a generated form does not have to assemble three components per field and get the
 * accessibility wiring right twenty times.
 *
 * Written with `createElement` rather than JSX to match the rest of this package: these
 * are `.ts` files, and switching to `.tsx` for a few components would split the package's
 * build configuration for no benefit.
 */

export interface FieldProps {
  readonly label: string;
  readonly children: ReactNode;
  /** Help text, usually from a schema's `.describe()`. */
  readonly hint?: string;
  /** Validation message. Replaces the hint, since the error is the more urgent thing. */
  readonly error?: string;
  readonly optional?: boolean;
}

/** Label, control, and message. The wrapper every generated field uses. */
export const Field = ({ label, children, hint, error, optional = false }: FieldProps) =>
  createElement(
    View,
    { className: 'gap-1' },
    createElement(
      View,
      { className: 'flex-row items-baseline justify-between' },
      createElement(Text, { className: 'text-sm font-medium text-text-primary' }, label),
      optional ? createElement(Text, { className: 'text-xs text-text-muted' }, 'optional') : null,
    ),
    children,
    error !== undefined
      ? createElement(Text, { className: 'text-xs text-danger' }, error)
      : hint !== undefined
        ? createElement(Text, { className: 'text-xs text-text-muted' }, hint)
        : null,
  );

export interface TextFieldProps {
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly keyboardType?: 'default' | 'numeric' | 'url' | 'email-address';
  readonly secure?: boolean;
  readonly editable?: boolean;
  readonly accessibilityLabel: string;
  readonly invalid?: boolean;
}

export const TextField = ({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = 'default',
  secure = false,
  editable = true,
  accessibilityLabel,
  invalid = false,
}: TextFieldProps) => {
  // The placeholder colour cannot come from a className, so it comes from the theme rather
  // than a hardcoded grey that would be invisible in dark mode.
  const { theme } = useTheme();

  return createElement(TextInput, {
    accessibilityLabel,
    value,
    onChangeText,
    placeholder,
    placeholderTextColor: theme.colors.textMuted,
    multiline,
    keyboardType,
    secureTextEntry: secure,
    editable,
    autoCapitalize: 'none',
    autoCorrect: false,
    className: [
      'rounded-lg border bg-surface px-3 py-2.5 text-sm text-text-primary',
      invalid ? 'border-danger' : 'border-border',
      multiline ? 'min-h-20' : '',
      editable ? '' : 'opacity-60',
    ].join(' '),
    style: multiline ? { textAlignVertical: 'top' } : undefined,
  });
};

export interface NumberFieldProps {
  readonly value: number | undefined;
  readonly onChange: (value: number | undefined) => void;
  readonly integer?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly placeholder?: string;
  readonly accessibilityLabel: string;
  readonly invalid?: boolean;
}

/**
 * A numeric input that keeps its own text.
 *
 * Deliberately not a controlled number. Parsing on every keystroke makes "1." collapse to
 * "1" and "-" impossible to type, because both are invalid numbers mid-entry. So the text
 * is local and the number is published only when it parses.
 */
export const NumberField = ({
  value,
  onChange,
  integer = false,
  min,
  max,
  placeholder,
  accessibilityLabel,
  invalid = false,
}: NumberFieldProps) => {
  const { theme } = useTheme();

  return createElement(TextInput, {
    accessibilityLabel,
    defaultValue: value === undefined ? '' : String(value),
    onChangeText: (text: string) => {
      if (text.trim() === '') {
        onChange(undefined);
        return;
      }

      const parsed = integer ? Number.parseInt(text, 10) : Number.parseFloat(text);
      if (!Number.isFinite(parsed)) return;

      // Clamped here rather than left to validation, so a slip of the finger cannot set a
      // 60-second timeout to 600.
      const clamped = Math.min(Math.max(parsed, min ?? -Infinity), max ?? Infinity);
      onChange(clamped);
    },
    placeholder,
    placeholderTextColor: theme.colors.textMuted,
    keyboardType: integer ? 'number-pad' : 'decimal-pad',
    className: [
      'rounded-lg border bg-surface px-3 py-2.5 text-sm text-text-primary',
      invalid ? 'border-danger' : 'border-border',
    ].join(' '),
  });
};

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps {
  readonly value: string | undefined;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
  readonly accessibilityLabel: string;
}

/**
 * Segmented choice rather than a dropdown.
 *
 * Every option is visible and one tap away, which for the two-to-five options a node
 * config actually has beats a picker that hides them behind a modal. It wraps, so a
 * longer enum degrades to a grid rather than overflowing.
 */
export const Select = ({ value, options, onChange, accessibilityLabel }: SelectProps) =>
  createElement(
    View,
    {
      accessibilityLabel,
      accessibilityRole: 'radiogroup',
      className: 'flex-row flex-wrap gap-2',
    },
    ...options.map((option) =>
      createElement(
        Pressable,
        {
          key: option.value,
          accessibilityRole: 'radio',
          accessibilityLabel: option.label,
          accessibilityState: { selected: value === option.value },
          onPress: () => onChange(option.value),
          className: [
            'rounded-md border px-3 py-2',
            value === option.value ? 'border-primary bg-primary' : 'border-border bg-surface',
          ].join(' '),
        },
        createElement(
          Text,
          {
            className: [
              'text-xs font-medium',
              value === option.value ? 'text-text-on-primary' : 'text-text-secondary',
            ].join(' '),
          },
          option.label,
        ),
      ),
    ),
  );

export interface ToggleProps {
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly accessibilityLabel: string;
}

export const Toggle = ({ value, onChange, accessibilityLabel }: ToggleProps) => {
  const { theme } = useTheme();

  return createElement(Switch, {
    accessibilityLabel,
    value,
    onValueChange: onChange,
    // Switch takes raw colours, so they come from the theme rather than the platform
    // default, which ignores the app's palette entirely.
    trackColor: { false: theme.colors.border, true: theme.colors.primaryMuted },
    thumbColor: value ? theme.colors.primary : theme.colors.surface,
  });
};

export interface EmptyStateProps {
  readonly title: string;
  readonly detail?: string;
  readonly action?: ReactNode;
}

/**
 * What a list shows when it has nothing.
 *
 * A blank area reads as a broken screen; saying what would appear here, and offering the
 * action that would create it, is the difference between an empty state and a dead end.
 */
export const EmptyState = ({ title, detail, action }: EmptyStateProps) =>
  createElement(
    View,
    { className: 'items-center gap-2 px-6 py-10' },
    createElement(
      Text,
      { className: 'text-center text-sm font-medium text-text-secondary' },
      title,
    ),
    detail === undefined
      ? null
      : createElement(Text, { className: 'text-center text-xs text-text-muted' }, detail),
    action ?? null,
  );
