import { Badge, Button, Card } from '@mobile-automation/ui';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AutomationStatusPanel } from '../automation/AutomationStatusPanel';

/**
 * The permission stage of onboarding.
 *
 * **Deliberately partial.** Step 2 builds the real permission engine: a capability registry, the
 * assistant-role and usage-access requests, and per-capability rationale screens. This stage exists
 * now so the onboarding flow and its gate are real, and so the shell is not built around a
 * placeholder that later has to be unpicked.
 *
 * What it does today is honest about that: it shows the capabilities the bridge can already report,
 * lets the user grant screen capture, and explains what is still to come rather than pretending the
 * list is complete.
 *
 * The **required** tier is not enforced yet, because four of the five capabilities have no runtime
 * prompt and the settings round trip is Step 2's work. Continuing is therefore allowed - with the
 * consequence stated - rather than blocking the user behind a check the app cannot yet perform.
 */

export interface PermissionSetupScreenProps {
  readonly onContinue: () => void;
  readonly onBack: () => void;
}

/** The required set, from `conventions/Permission_Model.md`. Step 2 makes each one requestable. */
const REQUIRED = [
  {
    name: 'Accessibility service',
    why: 'Reads what is on screen and taps for you. Nothing works without it.',
  },
  {
    name: 'Display over other apps',
    why: 'Shows the agent status panel and the node toolset on top of whatever app you are in.',
  },
  {
    name: 'Default assistant',
    why: 'Gives more precise screen reading than accessibility alone.',
  },
  {
    name: 'Usage access',
    why: 'Lets the app tell reliably which app is in the foreground.',
  },
  {
    name: 'Notifications',
    why: 'Shows a notification whenever automation is running, so you always know.',
  },
] as const;

export const PermissionSetupScreen = ({ onContinue, onBack }: PermissionSetupScreenProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 20,
          gap: 16,
        }}
      >
        <View accessibilityRole="header" style={{ gap: 8 }}>
          <Text className="text-3xl font-bold text-text-primary">Permissions</Text>
          <Text className="text-sm leading-5 text-text-secondary">
            These are the powerful ones. Each is explained before it is requested, and you can turn
            any of them off later from your phone&apos;s settings.
          </Text>
        </View>

        <Card title="Needed to work at all">
          <View style={{ gap: 14 }}>
            {REQUIRED.map((capability) => (
              <View
                key={capability.name}
                accessible
                accessibilityLabel={`${capability.name}. ${capability.why}`}
                style={{ gap: 2 }}
              >
                <Text className="text-sm font-medium text-text-primary">{capability.name}</Text>
                <Text className="text-xs leading-4 text-text-secondary">{capability.why}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* The live view of what the bridge can currently do. This is the part that already
            works, and it is also where screen-capture consent is granted. */}
        <AutomationStatusPanel />

        <Card
          title="Everything else is asked for when needed"
          trailing={<Badge label="later" tone="neutral" />}
          muted
        >
          <Text className="text-xs leading-4 text-text-secondary">
            Contacts, calling, messages, and the rest are only requested when a step or a tool
            actually needs them — not up front.
          </Text>
        </Card>

        <View style={{ gap: 8 }}>
          <Button label="Continue" full onPress={onContinue} />
          <Button label="Back" variant="ghost" full onPress={onBack} />
          <Text className="text-xs leading-4 text-text-muted">
            You can continue without granting everything, but automation will not run until the
            accessibility service is on.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};
