import { createElement, type ReactNode } from 'react';
import { Text, View } from 'react-native';

/**
 * Card: a titled surface.
 *
 * The most repeated shape in the app - every panel, status block, and list section is one
 * of these. Extracted so the border, radius, and padding are decided once; ten
 * hand-rolled panels drift within a single screen.
 */

export interface CardProps {
  readonly children: ReactNode;
  readonly title?: string;
  readonly subtitle?: string;
  /** Rendered on the title row, for an action or a status badge. */
  readonly trailing?: ReactNode;
  /** Sits above another surface - used for sheets and popovers. */
  readonly raised?: boolean;
  readonly muted?: boolean;
  readonly accessibilityLabel?: string;
}

export const Card = ({
  children,
  title,
  subtitle,
  trailing,
  raised = false,
  muted = false,
  accessibilityLabel,
}: CardProps) =>
  createElement(
    View,
    {
      accessible: accessibilityLabel !== undefined,
      accessibilityLabel,
      className: [
        'rounded-lg border border-border p-4',
        muted ? 'bg-surface-muted' : raised ? 'bg-surface-raised' : 'bg-surface',
      ].join(' '),
    },
    title === undefined
      ? null
      : createElement(
          View,
          { className: 'mb-2 flex-row items-start justify-between' },
          createElement(
            View,
            { className: 'flex-1 pr-3' },
            createElement(Text, { className: 'text-base font-semibold text-text-primary' }, title),
            subtitle === undefined
              ? null
              : createElement(Text, { className: 'mt-0.5 text-xs text-text-secondary' }, subtitle),
          ),
          trailing ?? null,
        ),
    children,
  );

/** A status word in a semantic colour. Used for node state and permission rows. */
export const TONES = ['neutral', 'good', 'warn', 'bad', 'accent'] as const;

export type Tone = (typeof TONES)[number];

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'text-text-muted',
  good: 'text-success',
  warn: 'text-warning',
  bad: 'text-danger',
  accent: 'text-primary',
};

export interface BadgeProps {
  readonly label: string;
  readonly tone?: Tone;
}

export const Badge = ({ label, tone = 'neutral' }: BadgeProps) =>
  createElement(Text, { className: `text-xs font-medium uppercase ${TONE_CLASS[tone]}` }, label);
