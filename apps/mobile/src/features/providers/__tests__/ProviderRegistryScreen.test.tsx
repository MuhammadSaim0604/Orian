import { act, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';

/**
 * The provider registry screen, as it appears inside root settings.
 *
 * Two things device testing caught, both about the screen's chrome rather than its behaviour: the title "AI
 * providers" appeared twice, and the delete action was a bare icon square beside a labelled Edit rectangle — two
 * different-looking controls doing comparable jobs.
 */

const mockRefresh = jest.fn(async () => undefined);
const mockRemove = jest.fn(async (_id: string) => undefined);
const mockActivate = jest.fn(async (_id: string) => undefined);

let mockProviders: {
  id: string;
  label: string;
  baseUrl: string;
  model: string | null;
  models: { id: string; name: string }[];
  modelsFetchedAtEpochMs: number | null;
  isActive: boolean;
  createdAtEpochMs: number;
  hasApiKey: boolean;
}[] = [];

jest.mock('../providerStore', () => ({
  useProviderStore: (selector: (state: unknown) => unknown) =>
    selector({
      providers: mockProviders,
      loading: false,
      error: null,
      refresh: mockRefresh,
      remove: mockRemove,
      activate: mockActivate,
      add: jest.fn(async () => undefined),
      update: jest.fn(async () => undefined),
      chooseModel: jest.fn(async () => undefined),
      fetchModels: jest.fn(async () => undefined),
      renameModel: jest.fn(async () => undefined),
      editModelId: jest.fn(async () => undefined),
      deleteModel: jest.fn(async () => undefined),
      addModel: jest.fn(async () => undefined),
      saveApiKey: jest.fn(async () => undefined),
    }),
}));

import { renderWithTheme } from '../../../test/renderWithTheme';
import { ProviderRegistryScreen } from '../ProviderRegistryScreen';

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockProviders = [
    {
      id: 'p1',
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      models: [{ id: 'gpt-4o-mini', name: 'Cheap' }],
      modelsFetchedAtEpochMs: Date.now(),
      isActive: true,
      createdAtEpochMs: 1,
      hasApiKey: true,
    },
  ];
});

describe('the heading', () => {
  it('does not repeat the title its container already shows', async () => {
    // The card in root settings is titled "AI providers". This screen rendering the same words produced two
    // identical headings stacked on the screen.
    const { queryByText } = renderWithTheme(<ProviderRegistryScreen />);
    await flush();

    expect(queryByText('AI providers')).toBeNull();
  });

  it('keeps the description, which says something the title does not', async () => {
    const { getByText } = renderWithTheme(<ProviderRegistryScreen />);
    await flush();

    expect(getByText(/OpenAI-compatible endpoint/)).toBeTruthy();
  });
});

describe('the actions on a provider', () => {
  it('labels delete rather than leaving it to a glyph', async () => {
    // Delete is the action whose consequence most needs spelling out. It was the one control with no words.
    const { getByText } = renderWithTheme(<ProviderRegistryScreen />);
    await flush();

    expect(getByText('Delete')).toBeTruthy();
    expect(getByText('Edit')).toBeTruthy();
  });

  it('confirms before removing, and removes when confirmed', async () => {
    // Deleting a provider also deletes its stored API key, so it asks first. The test drives the dialog's
    // destructive action rather than asserting on the tap alone, which would pass even if the callback were wired
    // to nothing.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByLabelText } = renderWithTheme(<ProviderRegistryScreen />);
    await flush();

    fireEvent.press(getByLabelText('Remove OpenAI'));
    await flush();

    expect(alert).toHaveBeenCalled();

    const buttons = alert.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === 'Remove')?.onPress?.();
    await flush();

    expect(mockRemove).toHaveBeenCalledWith('p1');

    alert.mockRestore();
  });
});
