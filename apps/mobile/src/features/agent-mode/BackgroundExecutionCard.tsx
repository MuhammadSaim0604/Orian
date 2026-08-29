import { Badge, Card } from '@mobile-automation/ui';
import { Text, View } from 'react-native';

import { SUSPICIOUS_GAP_MS, describeProbe, readProbe } from '../agent/backgroundProbe';

/**
 * What the last run's timing looked like.
 *
 * This is a diagnostic, and it is here on purpose rather than hidden behind a developer flag. Step 3
 * rests on an assumption — that JavaScript keeps executing under a foreground service while the app is
 * backgrounded (ADR 0012, ADR 0016) — and the only way to know whether it holds on a given device is to
 * measure it there. Every phone manufacturer has its own opinion about background execution, and several
 * are more aggressive than stock Android.
 *
 * So the app reports what it observed. If a device suspends the process, this says so plainly instead of
 * the user concluding the agent is unreliable and the developer never learning why.
 */
export const BackgroundExecutionCard = () => {
  const reading = readProbe();

  const suspended = reading !== null && reading.worstGapMs > SUSPICIOUS_GAP_MS;

  return (
    <Card
      title="Background execution"
      trailing={
        reading === null ? (
          <Badge label="untested" tone="neutral" />
        ) : (
          <Badge label={suspended ? 'throttled' : 'ok'} tone={suspended ? 'warn' : 'good'} />
        )
      }
      muted
    >
      <View style={{ gap: 6 }}>
        <Text className="text-xs leading-4 text-text-secondary">{describeProbe(reading)}</Text>

        {suspended && (
          <Text className="text-xs leading-4 text-text-muted">
            Your phone paused the app while it was in the background. Excluding Mobile Automation
            from battery optimisation usually fixes this.
          </Text>
        )}

        {reading === null && (
          <Text className="text-xs leading-4 text-text-muted">
            Run the agent once, leave the app while it works, and come back here.
          </Text>
        )}
      </View>
    </Card>
  );
};
