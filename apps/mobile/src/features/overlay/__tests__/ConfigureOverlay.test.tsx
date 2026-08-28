import { renderWithTheme } from '../../../test/renderWithTheme';
import { useCanvasStore } from '../../canvas/canvasStore';
import { ConfigureOverlay } from '../ConfigureOverlay';
import { useOverlayStore } from '../overlayStore';

/**
 * The floating toolset.
 *
 * The constraint being protected is that the overlay must stay small and always know which node it
 * is configuring. Both are things a screenshot would not catch and a user would only notice when
 * the feature was useless.
 */

const addConditionNode = (): string => {
  useCanvasStore.getState().reset();

  return useCanvasStore
    .getState()
    .addNodeAt(
      { type: 'condition', metadata: { label: 'If Send is visible' } },
      { width: 400, height: 800 },
    );
};

beforeEach(() => {
  useOverlayStore.getState().reset();
});

describe('ConfigureOverlay', () => {
  it('binds to the node it was given, so the AI always has the right context', () => {
    const nodeId = addConditionNode();

    renderWithTheme(<ConfigureOverlay nodeId={nodeId} />);

    expect(useOverlayStore.getState().nodeId).toBe(nodeId);
  });

  it('shows the node’s label, so the user can confirm what they are configuring', () => {
    const nodeId = addConditionNode();

    const { getByText } = renderWithTheme(<ConfigureOverlay nodeId={nodeId} />);

    expect(getByText('If Send is visible')).toBeTruthy();
  });

  it('opens with only the four compact tools', () => {
    // The overlay must not cover the screen the user is configuring against.
    const nodeId = addConditionNode();

    const { getByLabelText, queryByLabelText } = renderWithTheme(
      <ConfigureOverlay nodeId={nodeId} />,
    );

    expect(getByLabelText('Ask AI')).toBeTruthy();
    expect(getByLabelText('Element')).toBeTruthy();
    expect(queryByLabelText('Point')).toBeNull();
    expect(queryByLabelText('Screenshot')).toBeNull();
  });

  it('offers the eye toggle', () => {
    const nodeId = addConditionNode();

    const { getByLabelText } = renderWithTheme(<ConfigureOverlay nodeId={nodeId} />);

    expect(getByLabelText('Show all tools')).toBeTruthy();
  });

  it('reveals the rest of the tools once expanded', () => {
    const nodeId = addConditionNode();
    // Bound first: mounting binds, and binding a different node deliberately resets the session.
    useOverlayStore.getState().bind(nodeId);
    useOverlayStore.getState().setExpanded(true);

    const { getByLabelText } = renderWithTheme(<ConfigureOverlay nodeId={nodeId} />);

    expect(getByLabelText('Point')).toBeTruthy();
    expect(getByLabelText('Screenshot')).toBeTruthy();
    expect(getByLabelText('UI tree')).toBeTruthy();
  });

  it('starts on Ask AI with the instruction field ready', () => {
    const nodeId = addConditionNode();

    const { getByLabelText } = renderWithTheme(<ConfigureOverlay nodeId={nodeId} />);

    expect(getByLabelText('What should this step do?')).toBeTruthy();
  });

  it('can be closed', () => {
    const nodeId = addConditionNode();

    const { getByLabelText } = renderWithTheme(<ConfigureOverlay nodeId={nodeId} />);

    expect(getByLabelText('Close the toolset')).toBeTruthy();
  });

  it('shows a proposal with its summary and offers apply or discard', () => {
    // Offered rather than applied: the user is looking at another app and cannot see the node.
    const nodeId = addConditionNode();
    useOverlayStore.getState().bind(nodeId);
    useOverlayStore
      .getState()
      .setProposal(
        { condition: { type: 'element_exists', selector: { text: 'Send' } } },
        'Checks element exists for “Send”',
      );

    const { getByText } = renderWithTheme(<ConfigureOverlay nodeId={nodeId} />);

    expect(getByText('Checks element exists for “Send”')).toBeTruthy();
    expect(getByText('Apply')).toBeTruthy();
    expect(getByText('Discard')).toBeTruthy();
  });

  it('reports why the AI failed rather than going quiet', () => {
    const nodeId = addConditionNode();
    useOverlayStore.getState().bind(nodeId);
    useOverlayStore.getState().setProposalError('The response was not valid for this step.');

    const { getByText } = renderWithTheme(<ConfigureOverlay nodeId={nodeId} />);

    expect(getByText('The response was not valid for this step.')).toBeTruthy();
  });

  it('says the step is gone rather than showing an empty panel', () => {
    // The node can be deleted while the overlay sits over another app.
    useCanvasStore.getState().reset();
    useOverlayStore.getState().bind('ghost');
    useOverlayStore.getState().selectTool('node');

    const { getByText } = renderWithTheme(<ConfigureOverlay nodeId="ghost" />);

    expect(getByText('This step no longer exists.')).toBeTruthy();
  });

  it('tells the user the test checks resolution rather than acting', () => {
    const nodeId = addConditionNode();
    useOverlayStore.getState().bind(nodeId);
    useOverlayStore.getState().selectTool('test');

    const { getByText } = renderWithTheme(<ConfigureOverlay nodeId={nodeId} />);

    expect(getByText(/can find its target/)).toBeTruthy();
  });

  it('says it will test the AI’s suggestion when there is one', () => {
    const nodeId = addConditionNode();
    useOverlayStore.getState().bind(nodeId);
    useOverlayStore.getState().setProposal({}, 'x');
    useOverlayStore.getState().selectTool('test');

    const { getByText } = renderWithTheme(<ConfigureOverlay nodeId={nodeId} />);

    expect(getByText(/Tests the AI's suggestion/)).toBeTruthy();
  });

  it('warns that a bare coordinate is fragile', () => {
    const nodeId = addConditionNode();
    useOverlayStore.getState().bind(nodeId);
    useOverlayStore.getState().probePoint({ x: 500, y: 900 });
    useOverlayStore.getState().selectTool('coordinate');

    const { getByText } = renderWithTheme(<ConfigureOverlay nodeId={nodeId} />);

    expect(getByText(/will break if the layout changes/)).toBeTruthy();
  });
});
