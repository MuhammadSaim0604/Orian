import { type Edge, type Workflow, type WorkflowNode } from '@mobile-automation/workflow-schema';

/**
 * Canvas geometry.
 *
 * Kept as pure functions with no React and no store, because the canvas asks these
 * questions on every gesture frame and because getting them wrong is the sort of bug that
 * only shows as "the edge attaches to the wrong place". Pure functions can be tested
 * exhaustively without mounting anything.
 */

/** Node box size. Fixed rather than measured: measuring text inside a Skia canvas would
 * mean a layout pass per node per frame, and a uniform grid is easier to read anyway. */
export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 76;

/** Port hit radius. Larger than the drawn dot, because a finger is not a mouse. */
export const PORT_RADIUS = 7;
export const PORT_TOUCH_RADIUS = 22;

/** Grid pitch, also the snap step. */
export const GRID_SIZE = 20;

export type Point = { readonly x: number; readonly y: number };

export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** Where the camera is. Screen = (world + translate) * scale. */
export type Camera = {
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
};

export const IDENTITY_CAMERA: Camera = { translateX: 0, translateY: 0, scale: 1 };

/**
 * Zoom limits.
 *
 * Below 0.35 a node is an unreadable smudge; above 2.5 a single node fills the screen and
 * the user has lost the graph. Both bounds exist to stop a pinch leaving the user
 * somewhere they cannot navigate back from.
 */
export const MIN_SCALE = 0.35;
export const MAX_SCALE = 2.5;

export const clampScale = (scale: number): number =>
  Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);

/** World point to screen point. */
export const toScreen = (point: Point, camera: Camera): Point => ({
  x: (point.x + camera.translateX) * camera.scale,
  y: (point.y + camera.translateY) * camera.scale,
});

/**
 * Screen point to world point.
 *
 * The one every tap needs: a touch arrives in screen coordinates and the store holds world
 * coordinates, so without this a tap selects the wrong node whenever the canvas is panned.
 */
export const toWorld = (point: Point, camera: Camera): Point => ({
  x: point.x / camera.scale - camera.translateX,
  y: point.y / camera.scale - camera.translateY,
});

/** The node's box in world space. */
export const nodeRect = (node: WorkflowNode): Rect => ({
  x: node.metadata.position.x,
  y: node.metadata.position.y,
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
});

export const containsPoint = (rect: Rect, point: Point): boolean =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height;

/**
 * Where an output port sits, in world space.
 *
 * Ports are spread down the right edge, evenly spaced. Index-based rather than stored per
 * port, so adding an output to a node definition moves the ports without migrating any
 * saved workflow.
 */
export const outputPortPosition = (node: WorkflowNode, index: number, total: number): Point => ({
  x: node.metadata.position.x + NODE_WIDTH,
  y: node.metadata.position.y + portOffset(index, total),
});

/** Where an input port sits: the left edge, mirroring outputs. */
export const inputPortPosition = (node: WorkflowNode, index: number, total: number): Point => ({
  x: node.metadata.position.x,
  y: node.metadata.position.y + portOffset(index, total),
});

const portOffset = (index: number, total: number): number => {
  if (total <= 1) return NODE_HEIGHT / 2;

  // Inset so the first and last ports are not on the box's corners, where they would be
  // hard to hit and would look detached.
  const usable = NODE_HEIGHT - 24;
  return 12 + (usable / (total - 1)) * index;
};

/**
 * Control points for an edge's bezier.
 *
 * Horizontal handles, with the reach proportional to the horizontal gap. That is what makes
 * an edge leave a node sideways and arrive sideways, so two edges into the same node stay
 * visually distinct instead of overlapping into one thick line.
 *
 * The 40px floor matters for a backward edge, where the gap is negative: without it the
 * curve collapses into a straight line through the node body.
 */
export const edgeControlPoints = (from: Point, to: Point): [Point, Point] => {
  const reach = Math.max(40, Math.abs(to.x - from.x) * 0.5);

  return [
    { x: from.x + reach, y: from.y },
    { x: to.x - reach, y: to.y },
  ];
};

/** An SVG path for a bezier edge, which is what Skia's Path.fromSvgString wants. */
export const edgePath = (from: Point, to: Point): string => {
  const [c1, c2] = edgeControlPoints(from, to);

  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`;
};

/** Rounds a position to the grid, so hand-placed nodes still line up. */
export const snapToGrid = (point: Point, enabled = true): Point =>
  enabled
    ? {
        x: Math.round(point.x / GRID_SIZE) * GRID_SIZE,
        y: Math.round(point.y / GRID_SIZE) * GRID_SIZE,
      }
    : point;

/** The world rectangle currently visible, for skipping off-screen nodes. */
export const visibleWorldRect = (
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number,
): Rect => {
  const topLeft = toWorld({ x: 0, y: 0 }, camera);
  const bottomRight = toWorld({ x: viewportWidth, y: viewportHeight }, camera);

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
};

/**
 * Whether a node is worth drawing.
 *
 * Padded by a node's width so a node partly off-screen still draws its edge stubs -
 * culling exactly at the boundary makes edges visibly pop in and out at the screen edge.
 */
export const isNodeVisible = (node: WorkflowNode, view: Rect): boolean => {
  const rect = nodeRect(node);
  const pad = NODE_WIDTH;

  return (
    rect.x + rect.width >= view.x - pad &&
    rect.x <= view.x + view.width + pad &&
    rect.y + rect.height >= view.y - pad &&
    rect.y <= view.y + view.height + pad
  );
};

/**
 * A camera that fits every node on screen.
 *
 * Used when opening a workflow: a saved graph may sit anywhere in world space, and opening
 * to an empty viewport with the nodes off to one side reads as a lost workflow.
 */
export const cameraToFit = (
  nodes: readonly WorkflowNode[],
  viewportWidth: number,
  viewportHeight: number,
  padding = 48,
): Camera => {
  if (nodes.length === 0) return IDENTITY_CAMERA;

  const rects = nodes.map(nodeRect);
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));

  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;

  const scale = clampScale(
    Math.min(
      (viewportWidth - padding * 2) / Math.max(contentWidth, 1),
      (viewportHeight - padding * 2) / Math.max(contentHeight, 1),
      // Never zoom past 1:1 to fit a small graph - a two-node workflow blown up to fill a
      // tablet looks broken rather than helpful.
      1,
    ),
  );

  return {
    scale,
    translateX: -minX + (viewportWidth / scale - contentWidth) / 2,
    translateY: -minY + (viewportHeight / scale - contentHeight) / 2,
  };
};

/**
 * A free position for a new node.
 *
 * Placed in the middle of the current view, nudged along a diagonal until it does not
 * overlap. Dropping every new node at the same point produces a stack the user has to
 * untangle by hand before they can see what they added.
 */
export const freePosition = (
  existing: readonly WorkflowNode[],
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number,
): Point => {
  const centre = toWorld({ x: viewportWidth / 2, y: viewportHeight / 2 }, camera);

  let candidate = snapToGrid({
    x: centre.x - NODE_WIDTH / 2,
    y: centre.y - NODE_HEIGHT / 2,
  });

  const occupied = (point: Point): boolean =>
    existing.some(
      (node) =>
        Math.abs(node.metadata.position.x - point.x) < NODE_WIDTH &&
        Math.abs(node.metadata.position.y - point.y) < NODE_HEIGHT,
    );

  // Bounded: twenty offsets is far more than a screen holds, and an unbounded search on a
  // dense graph would hang the tap that added the node.
  for (let attempt = 0; attempt < 20 && occupied(candidate); attempt++) {
    candidate = { x: candidate.x + GRID_SIZE * 2, y: candidate.y + GRID_SIZE * 2 };
  }

  return candidate;
};

/** Resolved endpoints for drawing one edge. */
export type EdgeGeometry = {
  readonly edge: Edge;
  readonly from: Point;
  readonly to: Point;
};

/**
 * Resolves every edge to a pair of points.
 *
 * Handle indices come from the definitions' port lists, so an edge on a handle the node no
 * longer has resolves to nothing and is skipped rather than drawn to the origin - which
 * would appear as a line shooting off to the top-left corner.
 */
export const edgeGeometries = (
  workflow: Workflow,
  portsByType: ReadonlyMap<string, { outputs: readonly string[]; inputs: readonly string[] }>,
): readonly EdgeGeometry[] => {
  const nodesById = new Map<string, WorkflowNode>(workflow.nodes.map((node) => [node.id, node]));

  const resolved: EdgeGeometry[] = [];

  for (const edge of workflow.edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (source === undefined || target === undefined) continue;

    const sourcePorts = portsByType.get(source.type);
    const targetPorts = portsByType.get(target.type);
    if (sourcePorts === undefined || targetPorts === undefined) continue;

    const outputIndex = sourcePorts.outputs.indexOf(edge.sourceHandle);
    const inputIndex = targetPorts.inputs.indexOf(edge.targetHandle);
    if (outputIndex === -1 || inputIndex === -1) continue;

    resolved.push({
      edge,
      from: outputPortPosition(source, outputIndex, sourcePorts.outputs.length),
      to: inputPortPosition(target, inputIndex, targetPorts.inputs.length),
    });
  }

  return resolved;
};
