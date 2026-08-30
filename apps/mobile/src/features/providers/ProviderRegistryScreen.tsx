import { useTheme } from '@mobile-automation/ui';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { type Provider, DEFAULT_BASE_URL } from './providerRegistry';
import { useProviderStore } from './providerStore';

/**
 * The AI provider registry, in root settings.
 *
 * Root settings rather than a tab or a mode's own screen, because a provider is shared by Agent Mode and
 * Workflow Mode and belongs to neither (issue A5). Several providers with one active, and models discovered
 * from the provider rather than typed from memory (issue B6).
 *
 * **No screen in this file ever holds an API key.** The field is write-only: it is cleared the moment it is
 * saved, `hasApiKey` is what gets rendered, and there is no code path that reads a key back for display
 * (ADR 0007). An edit form that pre-filled the existing key would be the natural thing to build and is
 * exactly what that rule forbids.
 */

export const ProviderRegistryScreen = () => {
  const { theme } = useTheme();

  const providers = useProviderStore((state) => state.providers);
  const loading = useProviderStore((state) => state.loading);
  const refresh = useProviderStore((state) => state.refresh);
  const activate = useProviderStore((state) => state.activate);
  const remove = useProviderStore((state) => state.remove);

  const [editing, setEditing] = useState<Provider | 'new' | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onDelete = useCallback(
    (provider: Provider) => {
      Alert.alert(
        `Remove ${provider.label}?`,
        'Its API key will be deleted from this device. Any workflow or agent run using it will stop working until another provider is configured.',
        [
          { text: 'Keep', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void remove(provider.id);
            },
          },
        ],
      );
    },
    [remove],
  );

  if (editing !== null) {
    return (
      <ProviderForm provider={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
    );
  }

  return (
    <View style={{ gap: theme.spacing[3] }}>
      <View>
        <Text className="text-base font-semibold text-text-primary">AI providers</Text>
        <Text className="mt-1 text-xs text-text-secondary">
          Any OpenAI-compatible endpoint, including one running on your own machine. Shared by both
          modes.
        </Text>
      </View>

      {loading && providers.length === 0 ? (
        <Text className="text-xs text-text-muted">Loading…</Text>
      ) : providers.length === 0 ? (
        <Text className="text-xs text-text-muted">
          No providers yet. Add one to let the agent think.
        </Text>
      ) : (
        providers.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            onActivate={() => void activate(provider.id)}
            onEdit={() => setEditing(provider)}
            onDelete={() => onDelete(provider)}
          />
        ))
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add an AI provider"
        onPress={() => setEditing('new')}
        style={{ minHeight: MIN_TOUCH_TARGET }}
        className="items-center justify-center rounded-lg border border-primary active:opacity-80"
      >
        <Text className="text-sm font-semibold text-primary">Add a provider</Text>
      </Pressable>
    </View>
  );
};

const ProviderRow = ({
  provider,
  onActivate,
  onEdit,
  onDelete,
}: {
  readonly provider: Provider;
  readonly onActivate: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}) => (
  <View
    className={`rounded-lg border bg-surface p-3 ${
      provider.isActive ? 'border-primary' : 'border-border'
    }`}
  >
    <View className="flex-row items-center gap-2">
      <View className="flex-1">
        <Text className="text-sm font-medium text-text-primary">{provider.label}</Text>
        <Text numberOfLines={1} className="mt-0.5 text-xs text-text-muted">
          {provider.baseUrl}
        </Text>
      </View>

      {provider.isActive ? (
        <Text className="text-xs font-medium uppercase text-primary">Active</Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Use ${provider.label}`}
          onPress={onActivate}
          className="rounded-md border border-border px-3 py-2"
        >
          <Text className="text-xs font-medium text-text-secondary">Use</Text>
        </Pressable>
      )}
    </View>

    <View className="mt-2 flex-row items-center gap-3">
      <Text className="text-xs text-text-secondary">{provider.model ?? 'No model chosen'}</Text>

      {/* Whether a key exists, never the key. This is the whole of what a screen may know about it. */}
      <Text className={`text-xs ${provider.hasApiKey ? 'text-success' : 'text-warning'}`}>
        {provider.hasApiKey ? 'Key saved' : 'No key'}
      </Text>
    </View>

    <View className="mt-2 flex-row gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${provider.label}`}
        onPress={onEdit}
        className="rounded-md border border-border px-3 py-2"
      >
        <Text className="text-xs font-medium text-text-secondary">Edit</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${provider.label}`}
        onPress={onDelete}
        className="rounded-md border border-danger px-3 py-2"
      >
        <Text className="text-xs font-medium text-danger">Remove</Text>
      </Pressable>
    </View>
  </View>
);

/**
 * Add or edit a provider.
 *
 * The API key field is write-only and never shows what is stored — for an existing provider it says a key is
 * saved and offers to replace it. Pre-filling would require reading the key back into a component tree, which
 * is where it would end up in a crash report or a devtools snapshot.
 */
const ProviderForm = ({
  provider,
  onDone,
}: {
  readonly provider: Provider | null;
  readonly onDone: () => void;
}) => {
  const { theme } = useTheme();

  const save = useProviderStore((state) => state.save);
  const discover = useProviderStore((state) => state.discover);
  const chooseModel = useProviderStore((state) => state.chooseModel);
  const addModelManually = useProviderStore((state) => state.addModelManually);
  const discovery = useProviderStore((state) => state.discovery);
  const providers = useProviderStore((state) => state.providers);

  const [label, setLabel] = useState(provider?.label ?? '');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Re-read from the store rather than the captured prop, so a discovered model list appears without the form
  // being closed and reopened.
  const current =
    provider === null ? null : (providers.find((p) => p.id === provider.id) ?? provider);

  const onSave = useCallback(async () => {
    if (label.trim() === '' || baseUrl.trim() === '') {
      setProblem('A name and a base URL are both needed.');
      return;
    }

    setSaving(true);
    setProblem(null);

    const result = await save({
      id: provider?.id,
      label,
      baseUrl,
      model: current?.model ?? null,
      apiKey: apiKey === '' ? undefined : apiKey,
    });

    setSaving(false);

    if (!result.ok) {
      setProblem('The provider could not be saved.');
      return;
    }

    // Cleared immediately whether or not the write worked. The key must not sit in component state a moment
    // longer than the request that stores it.
    setApiKey('');

    if (!result.keyStored) {
      setProblem('The provider was saved but the key could not be stored on this device.');
      return;
    }

    onDone();
  }, [apiKey, baseUrl, current?.model, label, onDone, provider?.id, save]);

  const fetching = discovery.kind === 'fetching' && discovery.providerId === current?.id;
  const unavailable =
    discovery.kind === 'unavailable' && discovery.providerId === current?.id
      ? discovery.reason
      : null;

  return (
    <View style={{ gap: theme.spacing[3] }}>
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to providers"
          onPress={onDone}
          className="px-1 py-1"
        >
          <Text className="text-sm text-primary">Back</Text>
        </Pressable>

        <Text
          accessibilityRole="header"
          className="flex-1 text-base font-semibold text-text-primary"
        >
          {provider === null ? 'Add a provider' : provider.label}
        </Text>
      </View>

      <Field label="Name" hint="What you want to call it, such as “OpenAI” or “my laptop”.">
        <TextInput
          accessibilityLabel="Provider name"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          style={{ minHeight: MIN_TOUCH_TARGET }}
          value={label}
          onChangeText={setLabel}
          placeholder="OpenAI"
          placeholderTextColor={theme.colors.textMuted}
        />
      </Field>

      <Field
        label="Base URL"
        hint="The endpoint root, ending in /v1 for most providers. A local gateway works the same way."
      >
        <TextInput
          accessibilityLabel="Base URL"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          style={{ minHeight: MIN_TOUCH_TARGET }}
          value={baseUrl}
          onChangeText={setBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder={DEFAULT_BASE_URL}
          placeholderTextColor={theme.colors.textMuted}
        />
      </Field>

      <Field
        label="API key"
        hint={
          current?.hasApiKey === true
            ? 'A key is saved on this device. Type a new one to replace it.'
            : 'Stored encrypted on this device and never shown again.'
        }
      >
        <TextInput
          accessibilityLabel="API key"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          style={{ minHeight: MIN_TOUCH_TARGET }}
          value={apiKey}
          onChangeText={setApiKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder={current?.hasApiKey === true ? 'Replace the saved key' : 'sk-…'}
          placeholderTextColor={theme.colors.textMuted}
        />
      </Field>

      {current !== null && (
        <View style={{ gap: theme.spacing[2] }}>
          <Text className="text-sm font-medium text-text-primary">Model</Text>

          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-xs text-text-secondary">
              {current.model ?? 'None chosen'}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fetch the model list from the provider"
              accessibilityState={{ busy: fetching }}
              disabled={fetching}
              onPress={() => void discover(current)}
              className="rounded-md border border-border px-3 py-2"
            >
              <Text className="text-xs font-medium text-text-secondary">
                {fetching ? 'Fetching…' : 'Fetch models'}
              </Text>
            </Pressable>
          </View>

          {/* Stated as information, not as an error. Discovery failing is ordinary — plenty of providers do
              not implement /models — and manual entry below is a first-class path rather than a consolation. */}
          {unavailable != null && (
            <Text className="text-xs text-text-secondary">{unavailable}</Text>
          )}

          {current.models.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: theme.spacing[2] }}
            >
              {current.models.map((model) => (
                <Pressable
                  key={model}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${model}`}
                  accessibilityState={{ selected: model === current.model }}
                  onPress={() => void chooseModel(current.id, model)}
                  className={`rounded-full border px-3 py-2 ${
                    model === current.model
                      ? 'border-primary bg-surface'
                      : 'border-border bg-surface'
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      model === current.model ? 'font-semibold text-primary' : 'text-text-secondary'
                    }`}
                  >
                    {model}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View className="flex-row items-center gap-2">
            <TextInput
              accessibilityLabel="Model name"
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              style={{ minHeight: MIN_TOUCH_TARGET }}
              value={manualModel}
              onChangeText={setManualModel}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Or type a model name"
              placeholderTextColor={theme.colors.textMuted}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use this model name"
              accessibilityState={{ disabled: manualModel.trim() === '' }}
              disabled={manualModel.trim() === ''}
              onPress={() => {
                void addModelManually(current.id, manualModel);
                setManualModel('');
              }}
              style={{ minHeight: MIN_TOUCH_TARGET }}
              className={`items-center justify-center rounded-lg px-3 ${
                manualModel.trim() === '' ? 'bg-surface-muted' : 'bg-primary active:opacity-80'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  manualModel.trim() === '' ? 'text-text-muted' : 'text-text-on-primary'
                }`}
              >
                Use
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {problem != null && <Text className="text-xs text-danger">{problem}</Text>}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save this provider"
        accessibilityState={{ busy: saving }}
        disabled={saving}
        onPress={() => void onSave()}
        style={{ minHeight: MIN_TOUCH_TARGET }}
        className={`items-center justify-center rounded-lg ${
          saving ? 'bg-surface-muted' : 'bg-primary active:opacity-80'
        }`}
      >
        <Text
          className={`text-sm font-semibold ${saving ? 'text-text-muted' : 'text-text-on-primary'}`}
        >
          {saving ? 'Saving…' : 'Save'}
        </Text>
      </Pressable>

      {provider === null && (
        <Text className="text-xs text-text-muted">
          Save first, then fetch the model list — discovery needs the saved base URL and key.
        </Text>
      )}
    </View>
  );
};

const Field = ({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint: string;
  readonly children: React.ReactNode;
}) => (
  <View style={{ gap: 4 }}>
    <Text className="text-sm font-medium text-text-primary">{label}</Text>
    {children}
    <Text className="text-xs text-text-muted">{hint}</Text>
  </View>
);

const MIN_TOUCH_TARGET = 48;
