import { COMPACT_TOOLS, OVERLAY_TOOLS, useOverlayStore, visibleTools } from '../overlayStore';

/**
 * The overlay store.
 *
 * The behaviours worth protecting are the ones that stop a configuration being applied to the
 * wrong thing: a session is per node, and an element choice and a coordinate probe are mutually
 * exclusive answers to the same question.
 */

const element = (id: string) => ({
  id,
  depth: 1,
  text: 'Send',
  resourceId: 'com.whatsapp:id/send',
  contentDescription: null,
  className: 'android.widget.ImageButton',
  bounds: { left: 900, top: 1_800, right: 1_050, bottom: 1_950 },
  clickable: true,
  editable: false,
  scrollable: false,
  selector: { resourceId: 'com.whatsapp:id/send' },
  strategy: 'resourceId' as const,
});

const reset = () => useOverlayStore.getState().reset();

describe('binding to a node', () => {
  beforeEach(reset);

  it('starts unbound', () => {
    expect(useOverlayStore.getState().nodeId).toBeNull();
  });

  it('binds to the node it was opened for', () => {
    useOverlayStore.getState().bind('if_23');

    expect(useOverlayStore.getState().nodeId).toBe('if_23');
  });

  it('opens compact, so the overlay does not cover the screen being configured', () => {
    useOverlayStore.getState().bind('if_23');

    expect(useOverlayStore.getState().expanded).toBe(false);
  });

  it('starts on Ask AI, which is what the overlay is for', () => {
    useOverlayStore.getState().bind('if_23');

    expect(useOverlayStore.getState().activeTool).toBe('ask');
  });

  it('discards a previous node’s proposal when rebinding', () => {
    // Otherwise a config generated for one step could be accepted on another.
    useOverlayStore.getState().bind('if_23');
    useOverlayStore.getState().setProposal({ a: 1 }, 'something');

    useOverlayStore.getState().bind('click_4');

    expect(useOverlayStore.getState().proposal).toBeNull();
  });

  it('discards a previous node’s screen reading when rebinding', () => {
    useOverlayStore.getState().bind('if_23');
    useOverlayStore.getState().setReading({
      packageName: 'com.whatsapp',
      activityName: 'com.whatsapp.Conversation',
      elements: [element('a')],
      capturedAtEpochMs: 1,
      schemaMismatch: null,
    });

    useOverlayStore.getState().bind('click_4');

    expect(useOverlayStore.getState().reading).toBeNull();
  });
});

describe('the eye toggle', () => {
  beforeEach(reset);

  it('shows four tools when compact', () => {
    expect(visibleTools(false)).toHaveLength(4);
  });

  it('shows every tool when expanded', () => {
    expect(visibleTools(true)).toEqual(OVERLAY_TOOLS);
  });

  it('puts the tools that matter in the compact set', () => {
    // A fixed four rather than the first four declared.
    expect(COMPACT_TOOLS).toEqual(['ask', 'element', 'screen', 'node']);
  });

  it('expands automatically when a hidden tool is chosen', () => {
    // Making the user press the eye first would be a pointless extra step.
    useOverlayStore.getState().selectTool('coordinate');

    expect(useOverlayStore.getState().expanded).toBe(true);
    expect(useOverlayStore.getState().activeTool).toBe('coordinate');
  });

  it('stays compact when a visible tool is chosen', () => {
    useOverlayStore.getState().selectTool('element');

    expect(useOverlayStore.getState().expanded).toBe(false);
  });

  it('does not collapse when a visible tool is chosen while expanded', () => {
    useOverlayStore.getState().setExpanded(true);
    useOverlayStore.getState().selectTool('element');

    expect(useOverlayStore.getState().expanded).toBe(true);
  });
});

describe('element and coordinate selection', () => {
  beforeEach(reset);

  it('records the chosen element', () => {
    useOverlayStore.getState().selectElement(element('a'));

    expect(useOverlayStore.getState().selectedElement?.id).toBe('a');
  });

  it('clears a probed point when an element is chosen', () => {
    // They are alternative answers to the same question; keeping both leaves the config
    // ambiguous.
    useOverlayStore.getState().probePoint({ x: 10, y: 20 });
    useOverlayStore.getState().selectElement(element('a'));

    expect(useOverlayStore.getState().probedPoint).toBeNull();
  });

  it('clears a chosen element when a point is probed', () => {
    useOverlayStore.getState().selectElement(element('a'));
    useOverlayStore.getState().probePoint({ x: 10, y: 20 });

    expect(useOverlayStore.getState().selectedElement).toBeNull();
  });
});

describe('screen readings', () => {
  beforeEach(reset);

  it('clears the busy flag and any error when a reading arrives', () => {
    useOverlayStore.getState().setBusy(true);
    useOverlayStore.getState().setReadingError('earlier failure');

    useOverlayStore.getState().setReading({
      packageName: 'com.whatsapp',
      activityName: null,
      elements: [],
      capturedAtEpochMs: 1,
      schemaMismatch: null,
    });

    expect(useOverlayStore.getState().busy).toBe(false);
    expect(useOverlayStore.getState().readingError).toBeNull();
  });

  it('clears busy on failure too, so the button does not spin forever', () => {
    useOverlayStore.getState().setBusy(true);
    useOverlayStore.getState().setReadingError('failed');

    expect(useOverlayStore.getState().busy).toBe(false);
  });

  it('keeps a screenshot as a path', () => {
    useOverlayStore.getState().setScreenshotPath('/data/shot.png');

    expect(useOverlayStore.getState().screenshotPath).toBe('/data/shot.png');
  });
});

describe('proposals', () => {
  beforeEach(reset);

  it('holds the config and a summary the user can read', () => {
    // The user is looking at another app and cannot see the node, so the summary is what makes
    // acceptance informed.
    useOverlayStore
      .getState()
      .setProposal({ condition: { type: 'element_exists' } }, 'Checks Send');

    expect(useOverlayStore.getState().proposal?.summary).toBe('Checks Send');
  });

  it('clears the asking flag when a proposal arrives', () => {
    useOverlayStore.getState().setAsking(true);
    useOverlayStore.getState().setProposal({}, 'x');

    expect(useOverlayStore.getState().asking).toBe(false);
  });

  it('clears the asking flag on failure', () => {
    useOverlayStore.getState().setAsking(true);
    useOverlayStore.getState().setProposalError('bad output');

    expect(useOverlayStore.getState().asking).toBe(false);
  });

  it('clears a previous error when a new proposal succeeds', () => {
    useOverlayStore.getState().setProposalError('bad output');
    useOverlayStore.getState().setProposal({}, 'x');

    expect(useOverlayStore.getState().proposalError).toBeNull();
  });

  it('discards a proposal without applying it', () => {
    useOverlayStore.getState().setProposal({}, 'x');
    useOverlayStore.getState().clearProposal();

    expect(useOverlayStore.getState().proposal).toBeNull();
  });
});

describe('test outcomes', () => {
  beforeEach(reset);

  it('records what was tested and how it went', () => {
    useOverlayStore.getState().setTestOutcome({
      tool: 'findElement',
      succeeded: true,
      detail: 'Matched “Send” by resourceId.',
      at: 1,
    });

    const outcome = useOverlayStore.getState().lastTest;

    expect(outcome?.tool).toBe('findElement');
    expect(outcome?.succeeded).toBe(true);
  });

  it('survives a rebind of the same node’s tools but not a new node', () => {
    useOverlayStore.getState().bind('if_23');
    useOverlayStore.getState().setTestOutcome({
      tool: 'findElement',
      succeeded: true,
      detail: 'ok',
      at: 1,
    });

    useOverlayStore.getState().bind('click_4');

    expect(useOverlayStore.getState().lastTest).toBeNull();
  });
});
