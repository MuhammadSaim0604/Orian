import { act, fireEvent } from '@testing-library/react-native';

import { renderWithTheme } from '../../../test/renderWithTheme';
import { AssistPanel } from '../AssistPanel';

/**
 * The Orion Assist panel.
 *
 * The native side is mocked wholesale: this suite is about what the user sees in a window drawn over another app,
 * and the speech modules are exercised by the controller's own tests.
 *
 * The imports sit above the mocks rather than below them, which reads backwards but is correct: babel hoists every
 * `jest.mock` call above the imports anyway, and interleaving them trips `import/order`. The factories only *read*
 * the `mock*` variables when called, not when defined, so hoisting is safe here.
 */

const mockAsk = jest.fn(async (_question: string) => undefined);
const mockDismiss = jest.fn();
const mockStop = jest.fn();
const mockMicStart = jest.fn();

let mockSnapshot = {
  state: 'idle' as string,
  turns: [] as { id: string; role: string; text: string; actions: string[] }[],
  partialSpeech: '',
  error: null as string | null,
  pendingSpeech: null as string | null,
};

let mockMic = {
  available: true,
  listening: false,
  level: 0,
  error: null as string | null,
  start: mockMicStart,
  stop: jest.fn(),
};

jest.mock('../useAssistant', () => ({
  useAssistant: () => ({
    ...mockSnapshot,
    ask: mockAsk,
    stop: mockStop,
    dismiss: mockDismiss,
  }),
}));

jest.mock('../useAssistMic', () => ({
  useAssistMic: () => mockMic,
}));

const turn = (role: string, text: string, actions: string[] = []) => ({
  id: `${role}_${text.slice(0, 4)}`,
  role,
  text,
  actions,
});

beforeEach(() => {
  mockAsk.mockClear();
  mockDismiss.mockClear();
  mockStop.mockClear();
  mockMicStart.mockClear();

  mockSnapshot = {
    state: 'idle',
    turns: [],
    partialSpeech: '',
    error: null,
    pendingSpeech: null,
  };

  mockMic = {
    available: true,
    listening: false,
    level: 0,
    error: null,
    start: mockMicStart,
    stop: jest.fn(),
  };
});

describe('what is shown before anything is asked', () => {
  it('invites a question', () => {
    const { getByText } = renderWithTheme(<AssistPanel />);

    expect(getByText('Ask about this screen, or ask me to do something.')).toBeTruthy();
  });

  it('names itself, so the user knows what opened', () => {
    // Summoned by a gesture over another app. An unlabelled panel appearing over someone's banking app is alarming.
    const { getByText } = renderWithTheme(<AssistPanel />);

    expect(getByText('Orion')).toBeTruthy();
  });

  it('explains a withheld screen rather than just failing at it', () => {
    // The distinction that matters: "the screen was empty" is not fixable and "Android is not sharing this screen"
    // is — it is a setting the user can change.
    const { getByText } = renderWithTheme(<AssistPanel hasScreenContext={false} />);

    expect(getByText(/Android is not sharing this screen/)).toBeTruthy();
  });

  it('says nothing about screen context when it was given', () => {
    const { queryByText } = renderWithTheme(<AssistPanel hasScreenContext />);

    expect(queryByText(/not sharing this screen/)).toBeNull();
  });
});

describe('the transcript', () => {
  it('shows a question and its answer', () => {
    mockSnapshot.turns = [turn('user', 'what does this say'), turn('assistant', 'It says Send.')];

    const { getByText } = renderWithTheme(<AssistPanel />);

    expect(getByText('what does this say')).toBeTruthy();
    expect(getByText('It says Send.')).toBeTruthy();
  });

  it('renders the answer as markdown', () => {
    // The same renderer as the chat. Models write markdown wherever they are asked, and this panel is no exception.
    mockSnapshot.turns = [turn('assistant', 'It says **Send**.')];

    const { getByText, queryByText } = renderWithTheme(<AssistPanel />);

    expect(getByText('Send')).toBeTruthy();
    expect(queryByText('**Send**')).toBeNull();
  });

  it('shows what it did under the reply', () => {
    // An assistant that silently tapped something on your screen is unsettling, and a wrong action is easier to
    // report when the user can see what happened.
    mockSnapshot.turns = [turn('assistant', 'Sent it.', ['Tapped “Send”'])];

    const { getByText } = renderWithTheme(<AssistPanel />);

    expect(getByText('Tapped “Send”')).toBeTruthy();
  });

  it('shows words as they are heard', () => {
    // In the transcript rather than the input, so the user watches their words land where the answer will appear.
    mockSnapshot.partialSpeech = 'what does th';

    const { getByText } = renderWithTheme(<AssistPanel />);

    expect(getByText('what does th')).toBeTruthy();
  });

  it('says it is working', () => {
    mockSnapshot.state = 'thinking';

    const { getByText } = renderWithTheme(<AssistPanel />);

    expect(getByText('Working on it…')).toBeTruthy();
  });
});

describe('asking', () => {
  it('sends what was typed', () => {
    const { getByPlaceholderText } = renderWithTheme(<AssistPanel />);

    const input = getByPlaceholderText('Ask Orion');

    act(() => {
      input.props.onChangeText('what is this');
    });

    act(() => {
      input.props.onSubmitEditing();
    });

    expect(mockAsk).toHaveBeenCalledWith('what is this');
  });

  it('does not send an empty question', () => {
    const { getByPlaceholderText } = renderWithTheme(<AssistPanel />);

    act(() => {
      getByPlaceholderText('Ask Orion').props.onSubmitEditing();
    });

    expect(mockAsk).not.toHaveBeenCalled();
  });

  it('does not send while an answer is in flight', () => {
    mockSnapshot.state = 'thinking';

    const { getByPlaceholderText } = renderWithTheme(<AssistPanel />);
    const input = getByPlaceholderText('Ask Orion');

    act(() => {
      input.props.onChangeText('another');
    });

    act(() => {
      input.props.onSubmitEditing();
    });

    expect(mockAsk).not.toHaveBeenCalled();
  });
});

describe('the microphone', () => {
  it('offers to listen', () => {
    const { getByLabelText } = renderWithTheme(<AssistPanel />);

    // `fireEvent.press` rather than reaching into `.props.onPress`: the accessible node found by label is not
    // always the node carrying the handler, and a direct call silently does nothing.
    fireEvent.press(getByLabelText('Speak'));

    expect(mockMicStart).toHaveBeenCalled();
  });

  it('offers to stop while listening', () => {
    mockMic = { ...mockMic, listening: true };

    const { getByLabelText } = renderWithTheme(<AssistPanel />);

    expect(getByLabelText('Stop listening')).toBeTruthy();
  });

  it('is absent when the device has no recogniser', () => {
    // A button that can only fail is worse than no button.
    mockMic = { ...mockMic, available: false };

    const { queryByLabelText } = renderWithTheme(<AssistPanel />);

    expect(queryByLabelText('Speak')).toBeNull();
  });

  it('says what to do when a speech error has a fix', () => {
    mockMic = { ...mockMic, error: 'microphone_denied' };

    const { getByText } = renderWithTheme(<AssistPanel />);

    expect(
      getByText('I need permission to use the microphone. You can type instead.'),
    ).toBeTruthy();
  });

  it('offers typing as the way round any speech failure', () => {
    mockMic = { ...mockMic, error: 'network' };

    const { getByText } = renderWithTheme(<AssistPanel />);

    expect(getByText(/You can type instead/)).toBeTruthy();
  });
});

describe('stopping and closing', () => {
  it('offers stop only while there is something to stop', () => {
    const { queryByLabelText } = renderWithTheme(<AssistPanel />);

    expect(queryByLabelText('Stop')).toBeNull();
  });

  it('stops the answer and the voice together', () => {
    mockSnapshot.state = 'thinking';

    const { getByLabelText } = renderWithTheme(<AssistPanel />);

    fireEvent.press(getByLabelText('Stop'));

    expect(mockStop).toHaveBeenCalled();
  });

  it('closes when the area above is tapped', () => {
    // How every assistant panel behaves. Two elements carry the label, since the backdrop and the button do the
    // same job — the first is enough to prove the gesture is wired.
    const { getAllByLabelText } = renderWithTheme(<AssistPanel />);

    fireEvent.press(getAllByLabelText('Close Orion')[0]!);

    expect(mockDismiss).toHaveBeenCalled();
  });
});
