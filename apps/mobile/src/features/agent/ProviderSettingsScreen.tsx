import { useTheme } from '@mobile-automation/ui';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import {
  DEFAULT_PROVIDER_SETTINGS,
  type ProviderSettings,
  isProviderSettingsAvailable,
  loadProviderSettings,
  saveApiKey,
  saveBaseUrl,
  saveModel,
} from './providerSettings';

/**
 * AI provider settings.
 *
 * The key field is write-only, and that is the design rather than an omission. Once
 * stored, the key lives in the Android Keystore and the only reader is the provider
 * client at the moment of a request (ADR 0007). Rendering it back into a text input
 * would put it in a component tree, and from there into any crash report or devtools
 * snapshot.
 *
 * So the screen shows *whether* a key is configured, never the key itself. Replacing it
 * means typing a new one.
 */
export const ProviderSettingsScreen = () => {
  const { theme } = useTheme();

  const [settings, setSettings] = useState<ProviderSettings>(DEFAULT_PROVIDER_SETTINGS);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_PROVIDER_SETTINGS.baseUrl);
  const [model, setModel] = useState(DEFAULT_PROVIDER_SETTINGS.model);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const available = isProviderSettingsAvailable();

  useEffect(() => {
    if (!available) return;

    void loadProviderSettings().then((loaded) => {
      setSettings(loaded);
      setBaseUrl(loaded.baseUrl);
      setModel(loaded.model);
    });
  }, [available]);

  const save = useCallback(async () => {
    await saveBaseUrl(baseUrl);
    await saveModel(model);

    if (apiKeyDraft.trim() !== '') {
      const stored = await saveApiKey(apiKeyDraft);

      // Reported rather than assumed: a keystore that refused would otherwise leave the
      // user believing they had configured a provider.
      if (!stored) {
        setMessage('The key could not be saved securely on this device.');
        return;
      }

      // Cleared immediately, so it does not linger in component state.
      setApiKeyDraft('');
    }

    setSettings(await loadProviderSettings());
    setMessage('Saved.');
  }, [apiKeyDraft, baseUrl, model]);

  return (
    <View className="gap-3">
      <View accessibilityRole="header">
        <Text className="text-2xl font-bold text-text-primary">AI Provider</Text>
        <Text className="mt-1 text-sm text-text-secondary">
          Any OpenAI-compatible endpoint works, including a local one. Your key is stored encrypted
          on this device and is never sent anywhere except to the provider you name here.
        </Text>
      </View>

      {!available && (
        <View className="rounded-lg border border-warning bg-surface-muted p-3">
          <Text className="text-xs text-text-secondary">
            Provider settings need the native module, which is not present in this build.
          </Text>
        </View>
      )}

      <View className="gap-1">
        <Text className="text-sm font-medium text-text-primary">Base URL</Text>
        <TextInput
          accessibilityLabel="Provider base URL"
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary"
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder="https://api.openai.com/v1"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </View>

      <View className="gap-1">
        <Text className="text-sm font-medium text-text-primary">Model</Text>
        <TextInput
          accessibilityLabel="Model name"
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary"
          value={model}
          onChangeText={setModel}
          placeholder="gpt-4o-mini"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View className="gap-1">
        <Text className="text-sm font-medium text-text-primary">API key</Text>
        <TextInput
          accessibilityLabel="API key"
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary"
          value={apiKeyDraft}
          onChangeText={setApiKeyDraft}
          placeholder={settings.hasApiKey ? 'A key is stored. Type to replace it.' : 'sk-...'}
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Text className="text-xs text-text-muted">
          {settings.hasApiKey
            ? 'A key is stored. It cannot be displayed - enter a new one to replace it.'
            : 'Leave blank if your provider needs no key.'}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save provider settings"
        onPress={() => void save()}
        className="items-center rounded-lg bg-primary px-4 py-3"
      >
        <Text className="text-sm font-semibold text-text-on-primary">Save</Text>
      </Pressable>

      {message != null && (
        <Text className="text-xs text-text-secondary" accessibilityLiveRegion="polite">
          {message}
        </Text>
      )}
    </View>
  );
};
