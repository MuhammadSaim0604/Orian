import { useCallback, useState } from 'react';

import { PermissionSetupScreen } from './PermissionSetupScreen';
import { WelcomeScreen } from './WelcomeScreen';

/**
 * Onboarding: welcome, then permissions.
 *
 * Its own local stage state rather than a route in `shellStore`, because the stages are an
 * implementation detail of this flow. The shell only needs to know whether onboarding is finished;
 * putting each stage in the global route union would let any other screen navigate into the middle
 * of it, which is never a sensible thing to do.
 *
 * Step 2 adds stages here as each capability becomes requestable. The flow's shape - forward,
 * back, and a single completion callback - does not change when it does.
 */

export interface OnboardingFlowProps {
  /** Called once, when the user finishes. The shell persists completion and moves on. */
  readonly onComplete: () => void;
}

type Stage = 'welcome' | 'permissions';

export const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const [stage, setStage] = useState<Stage>('welcome');

  const toPermissions = useCallback(() => setStage('permissions'), []);
  const toWelcome = useCallback(() => setStage('welcome'), []);

  if (stage === 'welcome') {
    return <WelcomeScreen onContinue={toPermissions} />;
  }

  return <PermissionSetupScreen onContinue={onComplete} onBack={toWelcome} />;
};
