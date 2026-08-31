import { BackIcon, DeleteIcon, EditIcon, useTheme } from '@mobile-automation/ui';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { type Provider, type ProviderModel, DEFAULT_BASE_URL } from './providerRegistry';
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

  const [editingId, setEditingId] = useState<string | 'new' | null>(null);

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

  if (editingId !== null) {
    return (
      <ProviderForm
        // Looked up by id rather than held as an object, so the form re-renders with a freshly fetched model
        // list instead of the snapshot it was opened with.
        providerId={editingId === 'new' ? null : editingId}
        onDone={() => setEditingId(null)}
        onCreated={(id) => setEditingId(id)}
      />
    );
  }

  return (
    <View style={{ gap: theme.spacing[3] }}>
      {/* No heading here. The card this sits in already provides one, and rendering a second produced two
          identical "AI providers" titles stacked on the screen. The description stays, because it says something
          the title does not. */}
      <Text className="text-xs text-text-secondary">
        Any OpenAI-compatible endpoint, including one running on your own machine. Shared by both
        modes.
      </Text>

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
            onEdit={() => setEditingId(provider.id)}
            onDelete={() => onDelete(provider)}
          />
        ))
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add an AI provider"
        onPress={() => setEditingId('new')}
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
}) => {
  const { theme } = useTheme();
  const selected = provider.models.find((model) => model.id === provider.model) ?? null;

  return (
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
        {/* The name if the user gave one, since that is what they recognise. The id underneath, because that is
            what actually goes in the request and a wrong one is worth spotting here. */}
        <Text className="flex-1 text-xs text-text-secondary">
          {selected === null
            ? 'No model chosen'
            : selected.name === selected.id
              ? selected.id
              : `${selected.name} · ${selected.id}`}
        </Text>

        {/* Whether a key exists, never the key. This is the whole of what a screen may know about it. */}
        <Text className={`text-xs ${provider.hasApiKey ? 'text-success' : 'text-warning'}`}>
          {provider.hasApiKey ? 'Key saved' : 'No key'}
        </Text>
      </View>

      <View className="mt-2 flex-row items-center gap-2">
        {/* Both actions are labelled buttons of the same shape. A bare icon square beside a labelled rectangle
            read as two different kinds of control, and delete is the one that most needs its consequence spelled
            out rather than inferred from a glyph. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${provider.label}`}
          onPress={onEdit}
          style={{ minHeight: MIN_TOUCH_TARGET }}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-md border border-border active:opacity-70"
        >
          <EditIcon size={15} color={theme.colors.textSecondary} />
          <Text className="text-xs font-medium text-text-secondary">Edit</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${provider.label}`}
          onPress={onDelete}
          style={{ minHeight: MIN_TOUCH_TARGET }}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-md border border-danger active:opacity-70"
        >
          <DeleteIcon size={15} color={theme.colors.danger} />
          <Text className="text-xs font-medium text-danger">Delete</Text>
        </Pressable>
      </View>
    </View>
  );
};

/**
 * Add or edit a provider.
 *
 * The API key field is write-only and never shows what is stored — for an existing provider it says a key is
 * saved and offers to replace it. Pre-filling would require reading the key back into a component tree, which
 * is where it would end up in a crash report or a devtools snapshot.
 */
const ProviderForm = ({
  providerId,
  onDone,
  onCreated,
}: {
  readonly providerId: string | null;
  readonly onDone: () => void;
  readonly onCreated: (id: string) => void;
}) => {
  const { theme } = useTheme();

  const providers = useProviderStore((state) => state.providers);
  const save = useProviderStore((state) => state.save);
  const discover = useProviderStore((state) => state.discover);
  const chooseModel = useProviderStore((state) => state.chooseModel);
  const addModel = useProviderStore((state) => state.addModel);
  const renameModel = useProviderStore((state) => state.renameModel);
  const editModelId = useProviderStore((state) => state.editModelId);
  const deleteModel = useProviderStore((state) => state.deleteModel);
  const discovery = useProviderStore((state) => state.discovery);

  const current = providers.find((candidate) => candidate.id === providerId) ?? null;

  const [label, setLabel] = useState(current?.label ?? '');
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState('');
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const persist = useCallback(
    async (key: string): Promise<string | null> => {
      if (label.trim() === '' || baseUrl.trim() === '') {
        setProblem('A name and a base URL are both needed.');
        return null;
      }

      setSaving(true);
      setProblem(null);

      const result = await save({
        id: current?.id,
        label,
        baseUrl,
        model: current?.model ?? null,
        apiKey: key === '' ? undefined : key,
      });

      setSaving(false);

      if (!result.ok) {
        setProblem('The provider could not be saved.');
        return null;
      }

      if (!result.keyStored) {
        setProblem('The provider was saved but the key could not be stored on this device.');
      }

      return result.id;
    },
    [baseUrl, current?.id, current?.model, label, save],
  );

  /**
   * Saves the key and fetches models the moment the key field loses focus.
   *
   * Because the sequence otherwise takes four deliberate steps — type the key, save, reopen, tap Fetch — and
   * the user's intent after typing a key is obvious. The manual **Fetch models** button stays: this is a
   * shortcut for the common case, not a replacement for asking again later when a provider adds a model.
   *
   * Nothing happens without a key typed, so leaving the field untouched costs nothing.
   */
  const onKeyBlur = useCallback(async () => {
    const typed = apiKey.trim();
    if (typed === '') return;

    const savedId = await persist(typed);

    // Cleared whether or not the write worked. The key must not sit in component state a moment longer than the
    // request that stores it.
    setApiKey('');

    if (savedId === null) return;

    if (current === null) onCreated(savedId);

    const provider = useProviderStore
      .getState()
      .providers.find((candidate) => candidate.id === savedId);

    if (provider !== undefined) await discover(provider);
  }, [apiKey, current, discover, onCreated, persist]);

  const onSave = useCallback(async () => {
    const savedId = await persist(apiKey);
    setApiKey('');

    if (savedId === null) return;
    onDone();
  }, [apiKey, onDone, persist]);

  const fetching = discovery.kind === 'fetching' && discovery.providerId === current?.id;
  const unavailable =
    discovery.kind === 'unavailable' && discovery.providerId === current?.id
      ? discovery.reason
      : null;

  return (
    <View style={{ gap: theme.spacing[3] }}>
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to providers"
          onPress={onDone}
          style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET }}
          className="items-center justify-center"
        >
          <BackIcon size={20} color={theme.colors.primary} />
        </Pressable>

        <Text
          accessibilityRole="header"
          className="flex-1 text-base font-semibold text-text-primary"
        >
          {current === null ? 'Add a provider' : current.label}
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
            ? 'A key is saved on this device. Type a new one to replace it — models are fetched when you leave the field.'
            : 'Stored encrypted on this device and never shown again. Models are fetched when you leave the field.'
        }
      >
        <TextInput
          accessibilityLabel="API key"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          style={{ minHeight: MIN_TOUCH_TARGET }}
          value={apiKey}
          onChangeText={setApiKey}
          onBlur={() => void onKeyBlur()}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder={current?.hasApiKey === true ? 'Replace the saved key' : 'sk-…'}
          placeholderTextColor={theme.colors.textMuted}
        />
      </Field>

      {current !== null && (
        <View style={{ gap: theme.spacing[2] }}>
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-sm font-medium text-text-primary">Models</Text>

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

          <Text className="text-xs text-text-muted">
            The id is what the provider expects; the name is yours. Tap a row to use that model.
          </Text>

          {/* Stated as information, not as an error. Discovery failing is ordinary — plenty of providers do not
              implement /models — and manual entry below is a first-class path rather than a consolation. */}
          {unavailable != null && (
            <Text className="text-xs text-text-secondary">{unavailable}</Text>
          )}

          {current.models.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              selected={model.id === current.model}
              onSelect={() => void chooseModel(current.id, model.id)}
              onRename={(name) => void renameModel(current.id, model.id, name)}
              onChangeId={(nextId) => void editModelId(current.id, model.id, nextId)}
              onDelete={() => void deleteModel(current.id, model.id)}
            />
          ))}

          <View className="rounded-lg border border-dashed border-border bg-surface p-2">
            <Text className="mb-1 text-xs font-medium text-text-secondary">Add a model</Text>

            <View style={{ gap: theme.spacing[2] }}>
              <TextInput
                accessibilityLabel="New model id"
                className="rounded-md border border-border bg-background px-2 py-2 text-xs text-text-primary"
                style={{ minHeight: MIN_TOUCH_TARGET }}
                value={newModelId}
                onChangeText={setNewModelId}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Model id, e.g. gpt-4o-mini"
                placeholderTextColor={theme.colors.textMuted}
              />

              <TextInput
                accessibilityLabel="New model name"
                className="rounded-md border border-border bg-background px-2 py-2 text-xs text-text-primary"
                style={{ minHeight: MIN_TOUCH_TARGET }}
                value={newModelName}
                onChangeText={setNewModelName}
                placeholder="Name (optional)"
                placeholderTextColor={theme.colors.textMuted}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add this model"
                accessibilityState={{ disabled: newModelId.trim() === '' }}
                disabled={newModelId.trim() === ''}
                onPress={() => {
                  void addModel(current.id, { id: newModelId, name: newModelName });
                  setNewModelId('');
                  setNewModelName('');
                }}
                style={{ minHeight: MIN_TOUCH_TARGET }}
                className={`items-center justify-center rounded-md ${
                  newModelId.trim() === '' ? 'bg-surface-muted' : 'bg-primary active:opacity-80'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    newModelId.trim() === '' ? 'text-text-muted' : 'text-text-on-primary'
                  }`}
                >
                  Add
                </Text>
              </Pressable>
            </View>
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
    </View>
  );
};

/**
 * One model: two editable fields and a delete.
 *
 * Two fields stacked rather than side by side, because a model id is long — `gpt-4o-mini-2024-07-18` in half a
 * phone's width ellipsizes to nothing useful, and the id is the part that has to be exactly right.
 *
 * Each field commits on blur rather than on every keystroke. A per-keystroke write would persist `gpt-4`,
 * `gpt-4o`, `gpt-4o-` on the way to a valid id, and each intermediate value would be a real stored model.
 */
const ModelRow = ({
  model,
  selected,
  onSelect,
  onRename,
  onChangeId,
  onDelete,
}: {
  readonly model: ProviderModel;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onRename: (name: string) => void;
  readonly onChangeId: (id: string) => void;
  readonly onDelete: () => void;
}) => {
  const { theme } = useTheme();

  const [name, setName] = useState(model.name);
  const [id, setId] = useState(model.id);

  // Re-synced when the stored value changes underneath — a fetch merges names, and a rejected id edit leaves the
  // old value, which the field must go back to showing rather than keeping text that was not saved.
  useEffect(() => setName(model.name), [model.name]);
  useEffect(() => setId(model.id), [model.id]);

  return (
    <View
      className={`rounded-lg border bg-surface p-2 ${selected ? 'border-primary' : 'border-border'}`}
    >
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel={`Use ${model.name}`}
          accessibilityState={{ selected }}
          onPress={onSelect}
          style={{ minHeight: MIN_TOUCH_TARGET, minWidth: 32 }}
          className="items-center justify-center"
        >
          {/* A filled ring rather than a tick, so selection reads at a glance down a column of rows. */}
          <View
            className={`h-4 w-4 rounded-full border-2 ${
              selected ? 'border-primary bg-primary' : 'border-border'
            }`}
          />
        </Pressable>

        <Text className="flex-1 text-xs font-medium text-text-secondary">
          {selected ? 'In use' : 'Tap to use'}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${model.name}`}
          onPress={onDelete}
          style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET }}
          className="items-center justify-center"
        >
          <DeleteIcon size={18} color={theme.colors.danger} />
        </Pressable>
      </View>

      <View style={{ gap: theme.spacing[1], marginTop: theme.spacing[1] }}>
        <TextInput
          accessibilityLabel={`Name for ${model.id}`}
          className="rounded-md border border-border bg-background px-2 py-2 text-xs text-text-primary"
          style={{ minHeight: MIN_TOUCH_TARGET }}
          value={name}
          onChangeText={setName}
          onBlur={() => onRename(name)}
          placeholder="Name"
          placeholderTextColor={theme.colors.textMuted}
        />

        <TextInput
          accessibilityLabel={`Model id for ${model.name}`}
          className="rounded-md border border-border bg-background px-2 py-2 text-xs text-text-secondary"
          style={{ minHeight: MIN_TOUCH_TARGET }}
          value={id}
          onChangeText={setId}
          onBlur={() => onChangeId(id)}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Model id"
          placeholderTextColor={theme.colors.textMuted}
        />
      </View>
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
