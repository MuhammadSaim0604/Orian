import { useCanvasStore } from '../canvasStore';

/**
 * The canvas store.
 *
 * The behaviours tested here are the ones that keep an invalid workflow off the canvas in the
 * first place: removing a node takes its edges, a self-loop is refused, and one output handle
 * carries one edge. Each is a rule the engine also enforces - catching it at the point of
 * drawing means the user finds out immediately rather than when they press Run.
 */

const reset = () => useCanvasStore.getState().reset();

const addNode = (label: string, type = 'click') =>
  useCanvasStore.getState().addNodeAt({ type, metadata: { label } }, { width: 400, height: 800 });

describe('adding nodes', () => {
  beforeEach(reset);

  it('assigns an id derived from the node type', () => {
    // So a workflow's JSON is readable and a failing step names something recognisable.
    const id = addNode('Tap', 'click');

    expect(id.startsWith('click_')).toBe(true);
  });

  it('assigns unique ids to nodes added in quick succession', () => {
    // Two nodes added in the same millisecond would collide on a timestamp alone.
    const ids = [addNode('a'), addNode('b'), addNode('c')];

    expect(new Set(ids).size).toBe(3);
  });

  it('places nodes so they do not overlap', () => {
    const first = addNode('a');
    const second = addNode('b');

    const nodes = useCanvasStore.getState().nodes;

    expect(nodes[second]!.metadata.position).not.toEqual(nodes[first]!.metadata.position);
  });

  it('marks the workflow dirty', () => {
    addNode('a');

    expect(useCanvasStore.getState().dirty).toBe(true);
  });

  it('defaults the execution policy so a new node is runnable', () => {
    const id = addNode('a');

    expect(useCanvasStore.getState().nodes[id]!.executionPolicy).toBeDefined();
  });
});

describe('moving nodes', () => {
  beforeEach(reset);

  it('snaps to the grid by default', () => {
    const id = addNode('a');

    useCanvasStore.getState().moveNode(id, 33, 47);

    expect(useCanvasStore.getState().nodes[id]!.metadata.position).toEqual({ x: 40, y: 40 });
  });

  it('honours snapping being turned off', () => {
    const id = addNode('a');

    useCanvasStore.getState().setSnapEnabled(false);
    useCanvasStore.getState().moveNode(id, 33, 47);

    expect(useCanvasStore.getState().nodes[id]!.metadata.position).toEqual({ x: 33, y: 47 });
  });

  it('ignores a move for a node that does not exist', () => {
    // A gesture can outlive the node it started on if the user deletes it mid-drag.
    expect(() => useCanvasStore.getState().moveNode('ghost', 0, 0)).not.toThrow();
  });
});

describe('removing nodes', () => {
  beforeEach(reset);

  it('removes the edges attached to it', () => {
    // Leaving them produces a workflow that fails to load with a dangling-edge error the user
    // cannot see on the canvas.
    const a = addNode('a');
    const b = addNode('b');

    useCanvasStore
      .getState()
      .connect({ source: a, sourceHandle: 'next', target: b, targetHandle: 'in' });
    useCanvasStore.getState().removeNode(a);

    expect(Object.keys(useCanvasStore.getState().edges)).toEqual([]);
  });

  it('leaves unrelated edges alone', () => {
    const a = addNode('a');
    const b = addNode('b');
    const c = addNode('c');

    useCanvasStore
      .getState()
      .connect({ source: a, sourceHandle: 'next', target: b, targetHandle: 'in' });
    useCanvasStore
      .getState()
      .connect({ source: b, sourceHandle: 'next', target: c, targetHandle: 'in' });
    useCanvasStore.getState().removeNode(a);

    expect(Object.keys(useCanvasStore.getState().edges)).toHaveLength(1);
  });
});

describe('connecting', () => {
  beforeEach(reset);

  it('creates an edge', () => {
    const a = addNode('a');
    const b = addNode('b');

    const id = useCanvasStore
      .getState()
      .connect({ source: a, sourceHandle: 'next', target: b, targetHandle: 'in' });

    expect(id).not.toBeNull();
    expect(useCanvasStore.getState().edges[id!]!.source).toBe(a);
  });

  it('refuses a self-loop at the point of drawing', () => {
    // A self-edge is always a cycle the loader rejects; refusing it here means the user finds
    // out while drawing rather than when they press Run.
    const a = addNode('a');

    expect(
      useCanvasStore
        .getState()
        .connect({ source: a, sourceHandle: 'next', target: a, targetHandle: 'in' }),
    ).toBeNull();
  });

  it('refuses an edge to a node that does not exist', () => {
    const a = addNode('a');

    expect(
      useCanvasStore
        .getState()
        .connect({ source: a, sourceHandle: 'next', target: 'ghost', targetHandle: 'in' }),
    ).toBeNull();
  });

  it('refuses an exact duplicate', () => {
    const a = addNode('a');
    const b = addNode('b');

    useCanvasStore
      .getState()
      .connect({ source: a, sourceHandle: 'next', target: b, targetHandle: 'in' });

    expect(
      useCanvasStore
        .getState()
        .connect({ source: a, sourceHandle: 'next', target: b, targetHandle: 'in' }),
    ).toBeNull();
  });

  it('replaces an existing edge from the same output handle', () => {
    // The executor follows the first edge from a handle, so a second would be drawn but never
    // taken - a silently dead connection is worse than a replaced one.
    const a = addNode('a');
    const b = addNode('b');
    const c = addNode('c');

    useCanvasStore
      .getState()
      .connect({ source: a, sourceHandle: 'next', target: b, targetHandle: 'in' });
    useCanvasStore
      .getState()
      .connect({ source: a, sourceHandle: 'next', target: c, targetHandle: 'in' });

    const edges = Object.values(useCanvasStore.getState().edges);

    expect(edges).toHaveLength(1);
    expect(edges[0]!.target).toBe(c);
  });

  it('allows two edges from different handles of the same node', () => {
    // A condition's true and false branches both leave the same node.
    const gate = addNode('gate', 'condition');
    const b = addNode('b');
    const c = addNode('c');

    useCanvasStore
      .getState()
      .connect({ source: gate, sourceHandle: 'true', target: b, targetHandle: 'in' });
    useCanvasStore
      .getState()
      .connect({ source: gate, sourceHandle: 'false', target: c, targetHandle: 'in' });

    expect(Object.keys(useCanvasStore.getState().edges)).toHaveLength(2);
  });
});

describe('the workflow document', () => {
  beforeEach(reset);

  it('produces arrays from the keyed maps', () => {
    const a = addNode('a');
    const b = addNode('b');
    useCanvasStore
      .getState()
      .connect({ source: a, sourceHandle: 'next', target: b, targetHandle: 'in' });

    const workflow = useCanvasStore.getState().toWorkflow();

    expect(workflow.nodes).toHaveLength(2);
    expect(workflow.edges).toHaveLength(1);
  });

  it('stamps the update time', () => {
    const before = Date.now();
    const workflow = useCanvasStore.getState().toWorkflow();

    expect(new Date(workflow.metadata.updatedAt).getTime()).toBeGreaterThanOrEqual(before - 1_000);
  });

  it('round-trips through load', () => {
    addNode('a');
    const workflow = useCanvasStore.getState().toWorkflow();

    reset();
    useCanvasStore.getState().load(workflow);

    expect(Object.keys(useCanvasStore.getState().nodes)).toHaveLength(1);
  });

  it('is not dirty immediately after loading', () => {
    // A freshly opened workflow showing "unsaved" would train the user to ignore the badge.
    addNode('a');
    const workflow = useCanvasStore.getState().toWorkflow();

    useCanvasStore.getState().load(workflow);

    expect(useCanvasStore.getState().dirty).toBe(false);
  });

  it('does not restore the camera from the document', () => {
    // Camera position is a view concern; the canvas fits the graph on open instead.
    useCanvasStore.getState().setCamera({ translateX: 500, translateY: 500, scale: 2 });
    const workflow = useCanvasStore.getState().toWorkflow();

    useCanvasStore.getState().load(workflow);

    expect(useCanvasStore.getState().camera).toEqual({ translateX: 0, translateY: 0, scale: 1 });
  });
});

describe('dirty tracking', () => {
  beforeEach(reset);

  it('starts clean', () => {
    expect(useCanvasStore.getState().dirty).toBe(false);
  });

  it('clears on save', () => {
    addNode('a');
    useCanvasStore.getState().markSaved();

    expect(useCanvasStore.getState().dirty).toBe(false);
  });

  it('does not become dirty from a camera move', () => {
    // Panning is not an edit, and marking it as one would leave an unsaved badge on a workflow
    // nobody changed.
    useCanvasStore.getState().setCamera({ translateX: 10, translateY: 10, scale: 1 });

    expect(useCanvasStore.getState().dirty).toBe(false);
  });
});
