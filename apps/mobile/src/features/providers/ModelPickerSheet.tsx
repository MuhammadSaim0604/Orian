import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  SearchIcon,
  useTheme,
} from '@mobile-automation/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { type Provider } from './providerRegistry';
import { useProviderStore } from './providerStore';

/**
 * The model picker.
 *
 * Reached from the chat header, because the model is the one setting a person changes mid-conversation — a
 * cheap model for "open settings", a capable one for "work out how to do this". Sending them to root settings
 * and back for that would be three navigations for one tap.
 *
 * Grouped by provider and collapsible, because with two or three providers configured a flat list of forty
 * model ids says nothing about which endpoint each one runs on. All groups start expanded: collapsed-by-default
 * would hide the thing the sheet exists to show.
 *
 * Choosing a model **also activates its provider**, since a model belongs to one provider and there would be no
 * sense in selecting a model the run would not use. That is the whole reason this can be one tap.
 */

export interface ModelPickerSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

export const ModelPickerSheet = ({ visible, onClose }: ModelPickerSheetProps) => {
  const { theme } = useTheme();

  const providers = useProviderStore((state) => state.providers);
  const refresh = useProviderStore((state) => state.refresh);
  const activate = useProviderStore((state) => state.activate);
  const chooseModel = useProviderStore((state) => state.chooseModel);

  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<readonly string[]>([]);

  /**
   * The sheet's own slide, driven by a value rather than `Modal`'s `animationType`.
   *
   * `animationType="slide"` on Android slides the whole window from the bottom edge including the scrim, which
   * reads as a screen replacing the chat rather than a panel rising over it. Animating the panel inside a
   * transparent modal keeps the conversation visible behind it, which is what makes it feel like a sheet.
   */
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    void refresh();
    setQuery('');

    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: SHEET_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [refresh, slide, visible]);

  const close = useCallback(() => {
    // Animated out rather than unmounted immediately, because a panel that vanishes leaves the user unsure
    // whether their tap registered.
    Animated.timing(slide, {
      toValue: 0,
      duration: SHEET_DURATION_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onClose());
  }, [onClose, slide]);

  const toggleGroup = useCallback((providerId: string) => {
    setCollapsed((current) =>
      current.includes(providerId)
        ? current.filter((id) => id !== providerId)
        : [...current, providerId],
    );
  }, []);

  const onPick = useCallback(
    async (provider: Provider, modelId: string) => {
      // The provider first, so a run reading the registry between these two writes finds a provider whose model
      // is at least its own.
      if (!provider.isActive) await activate(provider.id);
      await chooseModel(provider.id, modelId);

      close();
    },
    [activate, chooseModel, close],
  );

  const groups = useMemo(() => filterProviders(providers, query), [providers, query]);

  const height = Math.round(Dimensions.get('window').height * SHEET_HEIGHT_FRACTION);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      {/* Tapping outside dismisses. Standard for a sheet, and the alternative is trapping someone who opened it
          by accident. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close the model picker"
        onPress={close}
        className="flex-1 bg-black/40"
      />

      <Animated.View
        style={{
          height,
          transform: [
            { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) },
          ],
        }}
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-border bg-background"
      >
        <View className="flex-row items-center gap-2 px-4 pb-2 pt-3">
          <View className="flex-1">
            <Text accessibilityRole="header" className="text-base font-semibold text-text-primary">
              Model
            </Text>
            <Text className="text-xs text-text-muted">
              Choosing one also switches to its provider.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={close}
            style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET }}
            className="items-center justify-center"
          >
            <CloseIcon size={18} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        <View className="mx-4 mb-2 flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3">
          <SearchIcon size={16} color={theme.colors.textMuted} />

          <TextInput
            accessibilityLabel="Search models"
            className="flex-1 py-2 text-sm text-text-primary"
            style={{ minHeight: MIN_TOUCH_TARGET - 8 }}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Search by name or id"
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: theme.spacing[4],
            paddingBottom: theme.spacing[6],
            gap: theme.spacing[2],
          }}
        >
          {providers.length === 0 ? (
            <Text className="py-6 text-center text-sm text-text-muted">
              No providers configured yet. Add one in settings.
            </Text>
          ) : groups.length === 0 ? (
            <Text className="py-6 text-center text-sm text-text-muted">
              Nothing matches “{query}”.
            </Text>
          ) : (
            groups.map((group) => (
              <ProviderGroup
                key={group.provider.id}
                provider={group.provider}
                models={group.models}
                // Search overrides a collapsed group: hiding a match the user just searched for would look
                // like the search not working.
                collapsed={query.trim() === '' && collapsed.includes(group.provider.id)}
                onToggle={() => toggleGroup(group.provider.id)}
                onPick={(modelId) => void onPick(group.provider, modelId)}
              />
            ))
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
};

const ProviderGroup = ({
  provider,
  models,
  collapsed,
  onToggle,
  onPick,
}: {
  readonly provider: Provider;
  readonly models: readonly Provider['models'][number][];
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly onPick: (modelId: string) => void;
}) => {
  const { theme } = useTheme();

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${provider.label}, ${collapsed ? 'expand' : 'collapse'}`}
        accessibilityState={{ expanded: !collapsed }}
        onPress={onToggle}
        style={{ minHeight: MIN_TOUCH_TARGET }}
        className={`flex-row items-center gap-2 rounded-xl border bg-surface px-3 ${
          provider.isActive ? 'border-primary' : 'border-border'
        }`}
      >
        <View className="flex-1">
          <Text className="text-sm font-medium text-text-primary">{provider.label}</Text>
          <Text className="text-xs text-text-muted">
            {models.length} model{models.length === 1 ? '' : 's'}
            {provider.isActive ? ' · in use' : ''}
          </Text>
        </View>

        {collapsed ? (
          <ChevronDownIcon size={16} color={theme.colors.textSecondary} />
        ) : (
          <ChevronUpIcon size={16} color={theme.colors.textSecondary} />
        )}
      </Pressable>

      {!collapsed && (
        <View style={{ gap: theme.spacing[1], marginTop: theme.spacing[1] }}>
          {models.length === 0 ? (
            <Text className="px-3 py-2 text-xs text-text-muted">
              No models yet — fetch or add one in settings.
            </Text>
          ) : (
            models.map((model) => {
              const inUse = provider.isActive && provider.model === model.id;

              return (
                <Pressable
                  key={model.id}
                  accessibilityRole="radio"
                  accessibilityLabel={`${model.name}, ${model.id}`}
                  accessibilityState={{ selected: inUse }}
                  onPress={() => onPick(model.id)}
                  style={{ minHeight: MIN_TOUCH_TARGET }}
                  className={`ml-3 flex-row items-center gap-2 rounded-lg border px-3 ${
                    inUse ? 'border-primary bg-surface' : 'border-border bg-surface'
                  }`}
                >
                  <View className="flex-1 py-2">
                    {/* Name first, id underneath. The name is what a person recognises; the id is the fact they
                        occasionally need to check. */}
                    <Text
                      numberOfLines={1}
                      className={`text-sm ${inUse ? 'font-semibold text-primary' : 'text-text-primary'}`}
                    >
                      {model.name}
                    </Text>
                    <Text numberOfLines={1} className="text-xs text-text-muted">
                      {model.id}
                    </Text>
                  </View>

                  {inUse && (
                    <Text className="text-xs font-medium uppercase text-primary">Using</Text>
                  )}
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </View>
  );
};

/**
 * Filters providers and their models by a query.
 *
 * A provider whose **label** matches keeps all its models, because someone typing "laptop" wants everything on
 * their laptop rather than nothing. Otherwise a provider is kept only if some model matches, so the list never
 * shows an empty group.
 */
const filterProviders = (
  providers: readonly Provider[],
  query: string,
): readonly {
  readonly provider: Provider;
  readonly models: readonly Provider['models'][number][];
}[] => {
  const needle = query.trim().toLowerCase();

  if (needle === '') return providers.map((provider) => ({ provider, models: provider.models }));

  const groups: { provider: Provider; models: readonly Provider['models'][number][] }[] = [];

  for (const provider of providers) {
    if (provider.label.toLowerCase().includes(needle)) {
      groups.push({ provider, models: provider.models });
      continue;
    }

    const models = provider.models.filter(
      (model) =>
        model.name.toLowerCase().includes(needle) || model.id.toLowerCase().includes(needle),
    );

    if (models.length > 0) groups.push({ provider, models });
  }

  return groups;
};

/** Half the screen, as asked. Enough for a few groups without covering the conversation entirely. */
const SHEET_HEIGHT_FRACTION = 0.55;

/** Long enough to read as a movement, short enough not to delay a deliberate tap. */
const SHEET_DURATION_MS = 220;

const MIN_TOUCH_TARGET = 48;
