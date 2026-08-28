import {
  GRID_SIZE,
  IDENTITY_CAMERA,
  MAX_SCALE,
  MIN_SCALE,
  NODE_HEIGHT,
  NODE_WIDTH,
  cameraToFit,
  clampScale,
  containsPoint,
  edgeControlPoints,
  edgePath,
  freePosition,
  inputPortPosition,
  isNodeVisible,
  nodeRect,
  outputPortPosition,
  snapToGrid,
  toScreen,
  toWorld,
  visibleWorldRect,
} from '../geometry';

/**
 * Canvas geometry.
 *
 * Pure maths, so it can be checked exhaustively without mounting anything - and worth checking,
 * because every bug in here presents as "the edge attaches to the wrong place" or "tapping
 * selects the wrong node", which are miserable to debug by eye.
 */

const node = (x: number, y: number, id = 'n') => ({
  id,
  type: 'click',
  version: '1.0.0',
  config: {},
  metadata: { label: 'Tap', position: { x, y } },
  executionPolicy: { retry: 0, retryDelayMs: 500, onError: 'stop' as const },
});

describe('coordinate conversion', () => {
  it('round-trips a point through screen and world space', () => {
    // The property that matters: a tap converted to world and back must land where it started,
    // or selection drifts as the canvas is panned.
    const camera = { translateX: 40, translateY: -25, scale: 1.5 };
    const point = { x: 123, y: 456 };

    const roundTripped = toWorld(toScreen(point, camera), camera);

    expect(roundTripped.x).toBeCloseTo(point.x);
    expect(roundTripped.y).toBeCloseTo(point.y);
  });

  it('is the identity with an identity camera', () => {
    expect(toScreen({ x: 10, y: 20 }, IDENTITY_CAMERA)).toEqual({ x: 10, y: 20 });
  });

  it('accounts for zoom', () => {
    expect(toScreen({ x: 100, y: 0 }, { translateX: 0, translateY: 0, scale: 2 })).toEqual({
      x: 200,
      y: 0,
    });
  });

  it('accounts for pan before zoom', () => {
    // Translate is applied in world space, so it scales with zoom - the ordering the renderer
    // uses. Reversing it makes panning while zoomed feel wrong.
    expect(toScreen({ x: 0, y: 0 }, { translateX: 10, translateY: 0, scale: 2 })).toEqual({
      x: 20,
      y: 0,
    });
  });
});

describe('scale clamping', () => {
  it('refuses to zoom out past readability', () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
  });

  it('refuses to zoom in past usefulness', () => {
    expect(clampScale(99)).toBe(MAX_SCALE);
  });

  it('leaves a sensible scale alone', () => {
    expect(clampScale(1.2)).toBe(1.2);
  });
});

describe('node boxes', () => {
  it('places the box at the node position', () => {
    expect(nodeRect(node(20, 40))).toEqual({
      x: 20,
      y: 40,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  });

  it('contains a point inside it', () => {
    expect(containsPoint(nodeRect(node(0, 0)), { x: 10, y: 10 })).toBe(true);
  });

  it('excludes a point outside it', () => {
    expect(containsPoint(nodeRect(node(0, 0)), { x: -1, y: 10 })).toBe(false);
    expect(containsPoint(nodeRect(node(0, 0)), { x: NODE_WIDTH + 1, y: 10 })).toBe(false);
  });

  it('includes the boundary, since a tap on the edge is a tap on the node', () => {
    expect(containsPoint(nodeRect(node(0, 0)), { x: NODE_WIDTH, y: NODE_HEIGHT })).toBe(true);
  });
});

describe('ports', () => {
  it('puts a single port at the vertical centre', () => {
    expect(outputPortPosition(node(0, 0), 0, 1).y).toBe(NODE_HEIGHT / 2);
  });

  it('puts outputs on the right edge and inputs on the left', () => {
    expect(outputPortPosition(node(100, 0), 0, 1).x).toBe(100 + NODE_WIDTH);
    expect(inputPortPosition(node(100, 0), 0, 1).x).toBe(100);
  });

  it('spreads several ports without putting any on a corner', () => {
    // A port on the corner is hard to hit and looks detached from the node.
    const first = outputPortPosition(node(0, 0), 0, 3);
    const last = outputPortPosition(node(0, 0), 2, 3);

    expect(first.y).toBeGreaterThan(0);
    expect(last.y).toBeLessThan(NODE_HEIGHT);
    expect(last.y).toBeGreaterThan(first.y);
  });

  it('spaces ports evenly', () => {
    const [a, b, c] = [0, 1, 2].map((index) => outputPortPosition(node(0, 0), index, 3).y);

    expect(b! - a!).toBeCloseTo(c! - b!);
  });
});

describe('edges', () => {
  it('uses horizontal control points, so edges leave and arrive sideways', () => {
    // What keeps two edges into the same node visually distinct rather than overlapping.
    const [c1, c2] = edgeControlPoints({ x: 0, y: 0 }, { x: 200, y: 100 });

    expect(c1.y).toBe(0);
    expect(c2.y).toBe(100);
    expect(c1.x).toBeGreaterThan(0);
    expect(c2.x).toBeLessThan(200);
  });

  it('keeps a minimum reach for a backward edge', () => {
    // Without the floor, a negative gap collapses the curve into a straight line through the
    // node body.
    const [c1, c2] = edgeControlPoints({ x: 200, y: 0 }, { x: 0, y: 0 });

    expect(c1.x).toBeGreaterThan(200);
    expect(c2.x).toBeLessThan(0);
  });

  it('produces a cubic SVG path', () => {
    const path = edgePath({ x: 0, y: 0 }, { x: 100, y: 50 });

    expect(path.startsWith('M 0 0 C ')).toBe(true);
    expect(path.endsWith('100 50')).toBe(true);
  });
});

describe('snapping', () => {
  it('rounds to the grid', () => {
    expect(snapToGrid({ x: 23, y: 37 })).toEqual({ x: GRID_SIZE, y: 40 });
  });

  it('leaves a point alone when snapping is off', () => {
    expect(snapToGrid({ x: 23, y: 37 }, false)).toEqual({ x: 23, y: 37 });
  });

  it('handles negative coordinates', () => {
    expect(snapToGrid({ x: -23, y: -37 })).toEqual({ x: -20, y: -40 });
  });
});

describe('culling', () => {
  it('reports the visible world rectangle', () => {
    const view = visibleWorldRect({ translateX: 0, translateY: 0, scale: 1 }, 400, 800);

    expect(view).toEqual({ x: 0, y: 0, width: 400, height: 800 });
  });

  it('shrinks the visible rectangle as the camera zooms in', () => {
    const view = visibleWorldRect({ translateX: 0, translateY: 0, scale: 2 }, 400, 800);

    expect(view.width).toBe(200);
  });

  it('keeps a node inside the view', () => {
    expect(isNodeVisible(node(10, 10), { x: 0, y: 0, width: 400, height: 800 })).toBe(true);
  });

  it('keeps a node just off-screen, so its edges do not pop in and out', () => {
    // Culling exactly at the boundary makes edges visibly appear and disappear at the screen
    // edge, which reads as a rendering fault.
    expect(isNodeVisible(node(-NODE_WIDTH + 5, 10), { x: 0, y: 0, width: 400, height: 800 })).toBe(
      true,
    );
  });

  it('drops a node far outside the view', () => {
    expect(isNodeVisible(node(5_000, 5_000), { x: 0, y: 0, width: 400, height: 800 })).toBe(false);
  });
});

describe('fitting the view', () => {
  it('returns the identity camera for an empty workflow', () => {
    expect(cameraToFit([], 400, 800)).toEqual(IDENTITY_CAMERA);
  });

  it('never zooms past 1:1 to fit a small graph', () => {
    // A two-node workflow blown up to fill a tablet looks broken rather than helpful.
    expect(cameraToFit([node(0, 0)], 1_200, 1_600).scale).toBeLessThanOrEqual(1);
  });

  it('zooms out to fit a wide graph', () => {
    const wide = [node(0, 0, 'a'), node(4_000, 0, 'b')];

    expect(cameraToFit(wide, 400, 800).scale).toBeLessThan(1);
  });

  it('respects the minimum scale on an enormous graph', () => {
    const enormous = [node(0, 0, 'a'), node(100_000, 100_000, 'b')];

    expect(cameraToFit(enormous, 400, 800).scale).toBe(MIN_SCALE);
  });

  it('brings a distant graph into view', () => {
    // A saved workflow can sit anywhere in world space, and opening to an empty viewport with
    // the nodes off to one side reads as a lost workflow.
    const camera = cameraToFit([node(9_000, 9_000)], 400, 800);
    const onScreen = toScreen({ x: 9_000, y: 9_000 }, camera);

    expect(onScreen.x).toBeGreaterThan(0);
    expect(onScreen.x).toBeLessThan(400);
    expect(onScreen.y).toBeGreaterThan(0);
    expect(onScreen.y).toBeLessThan(800);
  });
});

describe('placing a new node', () => {
  it('places the first node near the centre of the view', () => {
    const position = freePosition([], IDENTITY_CAMERA, 400, 800);

    expect(position.x).toBeGreaterThan(0);
    expect(position.y).toBeGreaterThan(0);
  });

  it('snaps the new position to the grid', () => {
    const position = freePosition([], IDENTITY_CAMERA, 400, 800);

    expect(position.x % GRID_SIZE).toBe(0);
    expect(position.y % GRID_SIZE).toBe(0);
  });

  it('does not stack a new node on an existing one', () => {
    // Dropping every node at the same point produces a pile the user must untangle before they
    // can see what they added.
    const first = freePosition([], IDENTITY_CAMERA, 400, 800);
    const second = freePosition([node(first.x, first.y)], IDENTITY_CAMERA, 400, 800);

    expect(second).not.toEqual(first);
  });

  it('gives up after a bounded search rather than hanging', () => {
    // An unbounded search on a dense graph would freeze the tap that added the node.
    const dense = Array.from({ length: 200 }, (_unused, index) =>
      node(index * GRID_SIZE * 2, index * GRID_SIZE * 2, `n${index}`),
    );

    expect(() => freePosition(dense, IDENTITY_CAMERA, 400, 800)).not.toThrow();
  });
});
