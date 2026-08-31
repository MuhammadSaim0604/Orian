import { act, fireEvent } from '@testing-library/react-native';

/**
 * The model picker.
 *
 * Reached from the chat header, because the model is the one setting a person changes mid-conversation. Two
 * behaviours here are easy to get wrong and would be quietly confusing rather than obviously broken:
 *
 * - Choosing a model must **also activate its provider**, or the run would use a different provider from the one
 *   whose model was just picked.
 * - Search must override a collapsed group, or a match the user just typed would be hidden and look like the
 *   search not working.
 */

const mockActivate = jest.fn(async () => undefined);
const mockChooseModel = jest.fn(async () => undefined);

/**
 * Stable across renders, deliberately.
 *
 * A `jest.fn()` created inside the selector would be a new reference on every render, and the sheet's mount effect
 * depends on `refresh` — so the effect would re-run on every render and reset the search box as fast as the user
 * typed into it. The real store returns stable actions, so this mirrors it rather than being a workaround.
 */
const mockRefresh = jest.fn(async () => undefined);

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
      refresh: mockRefresh,
      activate: mockActivate,
      chooseModel: mockChooseModel,
    }),
}));

import { renderWithTheme } from '../../../test/renderWithTheme';
import { ModelPickerSheet } from '../ModelPickerSheet';

const provider = (
  id: string,
  label: string,
  models: { id: string; name: string }[],
  isActive = false,
  model: string | null = null,
) => ({
  id,
  label,
  baseUrl: `https://${id}.example/v1`,
  model,
  models,
  modelsFetchedAtEpochMs: Date.now(),
  isActive,
  createdAtEpochMs: 1,
  hasApiKey: true,
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockProviders = [
    provider(
      'p1',
      'OpenAI',
      [
        { id: 'gpt-4o', name: 'Capable' },
        { id: 'gpt-4o-mini', name: 'Cheap' },
      ],
      true,
      'gpt-4o-mini',
    ),
    provider('p2', 'My laptop', [{ id: 'llama-3', name: 'llama-3' }]),
  ];
});

describe('what it shows', () => {
  it('groups models under their provider', async () => {
    // With two or three providers configured, a flat list of model ids says nothing about which endpoint each one
    // runs on.
    const { getByText } = renderWithTheme(<ModelPickerSheet visible onClose={jest.fn()} />);
    await flush();

    expect(getByText('OpenAI')).toBeTruthy();
    expect(getByText('My laptop')).toBeTruthy();
  });

  it('shows the name with the id underneath', async () => {
    // The name is what a person recognises; the id is the fact they occasionally need to check.
    const { getByText } = renderWithTheme(<ModelPickerSheet visible onClose={jest.fn()} />);
    await flush();

    expect(getByText('Capable')).toBeTruthy();
    expect(getByText('gpt-4o')).toBeTruthy();
  });

  it('marks the model in use', async () => {
    const { getByText } = renderWithTheme(<ModelPickerSheet visible onClose={jest.fn()} />);
    await flush();

    expect(getByText('Using')).toBeTruthy();
  });

  it('starts with every group expanded', async () => {
    // Collapsed by default would hide the thing the sheet exists to show.
    const { getAllByText } = renderWithTheme(<ModelPickerSheet visible onClose={jest.fn()} />);
    await flush();

    // Twice: as the name and as the id, since this model has never been renamed.
    expect(getAllByText('llama-3')).toHaveLength(2);
  });

  it('says so when nothing is configured', async () => {
    mockProviders = [];

    const { getByText } = renderWithTheme(<ModelPickerSheet visible onClose={jest.fn()} />);
    await flush();

    expect(getByText(/No providers configured/)).toBeTruthy();
  });
});

describe('choosing a model', () => {
  it('activates the provider as well as the model', async () => {
    // A model belongs to one provider. Selecting a model the run would not use makes no sense, and this is what
    // makes it one tap rather than two.
    const onClose = jest.fn();
    const { getByLabelText } = renderWithTheme(<ModelPickerSheet visible onClose={onClose} />);
    await flush();

    fireEvent.press(getByLabelText('llama-3, llama-3'));
    await flush();

    expect(mockActivate).toHaveBeenCalledWith('p2');
    expect(mockChooseModel).toHaveBeenCalledWith('p2', 'llama-3');
  });

  it('does not re-activate the provider already in use', async () => {
    const { getByLabelText } = renderWithTheme(<ModelPickerSheet visible onClose={jest.fn()} />);
    await flush();

    fireEvent.press(getByLabelText('Capable, gpt-4o'));
    await flush();

    expect(mockActivate).not.toHaveBeenCalled();
    expect(mockChooseModel).toHaveBeenCalledWith('p1', 'gpt-4o');
  });
});

describe('search', () => {
  it('matches on the model name', async () => {
    const { getByLabelText, queryByText } = renderWithTheme(
      <ModelPickerSheet visible onClose={jest.fn()} />,
    );
    await flush();

    fireEvent.changeText(getByLabelText('Search models'), 'cheap');
    await flush();

    expect(queryByText('Cheap')).toBeTruthy();
    expect(queryByText('Capable')).toBeNull();
  });

  it('matches on the model id', async () => {
    const { getByLabelText, queryByText } = renderWithTheme(
      <ModelPickerSheet visible onClose={jest.fn()} />,
    );
    await flush();

    fireEvent.changeText(getByLabelText('Search models'), 'llama');
    await flush();

    expect(queryByText('My laptop')).toBeTruthy();
    expect(queryByText('OpenAI')).toBeNull();
  });

  it('keeps every model when the provider name matches', async () => {
    // Someone typing "laptop" wants everything on their laptop, not nothing.
    const { getByLabelText, queryAllByText } = renderWithTheme(
      <ModelPickerSheet visible onClose={jest.fn()} />,
    );
    await flush();

    fireEvent.changeText(getByLabelText('Search models'), 'laptop');
    await flush();

    expect(queryAllByText('llama-3').length).toBeGreaterThan(0);
  });

  it('reports no matches rather than showing an empty list', async () => {
    const { getByLabelText, getByText } = renderWithTheme(
      <ModelPickerSheet visible onClose={jest.fn()} />,
    );
    await flush();

    fireEvent.changeText(getByLabelText('Search models'), 'nothing-like-this');
    await flush();

    expect(getByText(/Nothing matches/)).toBeTruthy();
  });
});

describe('collapsing a group', () => {
  it('hides its models', async () => {
    const { getByLabelText, queryAllByText } = renderWithTheme(
      <ModelPickerSheet visible onClose={jest.fn()} />,
    );
    await flush();

    fireEvent.press(getByLabelText('My laptop, collapse'));
    await flush();

    expect(queryAllByText('llama-3')).toHaveLength(0);
  });

  it('is overridden by a search, so a match is never hidden', async () => {
    // Otherwise typing a model's name would appear to do nothing, which reads as broken search.
    const { getByLabelText, queryAllByText } = renderWithTheme(
      <ModelPickerSheet visible onClose={jest.fn()} />,
    );
    await flush();

    fireEvent.press(getByLabelText('My laptop, collapse'));
    await flush();

    fireEvent.changeText(getByLabelText('Search models'), 'llama');
    await flush();

    expect(queryAllByText('llama-3').length).toBeGreaterThan(0);
  });
});
