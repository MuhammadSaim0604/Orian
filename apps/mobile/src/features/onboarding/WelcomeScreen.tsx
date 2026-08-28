import { Button } from '@mobile-automation/ui';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The first thing a new user sees.
 *
 * Its job is to earn the permission requests that come next. This app asks for the ability to read
 * the screen and tap on the user's behalf, which is close to the most powerful grant Android
 * offers - and a permission screen that arrives with no context reads as an app overreaching.
 *
 * So it says plainly what the app does, what it will need, and that everything stays on the
 * device. Nothing here is a feature list; it is the case for continuing.
 */

export interface WelcomeScreenProps {
  readonly onContinue: () => void;
}

export const WelcomeScreen = ({ onContinue }: WelcomeScreenProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 48,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
          flexGrow: 1,
        }}
      >
        <View className="flex-1 justify-center" style={{ gap: 28 }}>
          <View accessibilityRole="header" style={{ gap: 10 }}>
            <Text className="text-4xl font-bold text-text-primary">Automate your phone</Text>
            <Text className="text-base leading-6 text-text-secondary">
              Describe what you want done and let an AI agent do it, or build a workflow visually
              and run it whenever you like.
            </Text>
          </View>

          <View style={{ gap: 18 }}>
            <Point
              title="Ask an agent"
              detail="“Send Robert a WhatsApp message that I'll be late.” It reads the screen, taps, and types — while you do something else."
            />
            <Point
              title="Or build a workflow"
              detail="Drag steps onto a canvas, wire up conditions and loops, and run it on demand."
            />
            <Point
              title="It stays on your phone"
              detail="Screen content is read on-device. It only ever leaves for the AI provider you choose, and only when you ask for something that needs one."
            />
          </View>

          <View style={{ gap: 10 }}>
            <Text className="text-sm leading-5 text-text-secondary">
              To do any of this, the app needs permission to see your screen and act on it. The next
              few screens explain each one before asking.
            </Text>

            <Button label="Get started" full onPress={onContinue} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const Point = ({ title, detail }: { readonly title: string; readonly detail: string }) => (
  <View accessible accessibilityLabel={`${title}. ${detail}`} style={{ gap: 3 }}>
    <Text className="text-base font-semibold text-text-primary">{title}</Text>
    <Text className="text-sm leading-5 text-text-secondary">{detail}</Text>
  </View>
);
