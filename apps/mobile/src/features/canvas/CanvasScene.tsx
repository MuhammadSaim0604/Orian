import { type NodeState } from '@mobile-automation/shared-types';
import { type Theme } from '@mobile-automation/ui';
import { type Edge, type WorkflowNode } from '@mobile-automation/workflow-schema';
import {
  Canvas,
  Circle,
  Group,
  Path,
  Rect,
  RoundedRect,
  Skia,
  Text as SkiaText,
  useFont,
  vec,
} from '@shopify/react-native-skia';

import {
  type Camera,
  GRID_SIZE,
  NODE_HEIGHT,
  NODE_WIDTH,
  PORT_RADIUS,
  type Point,
  type Rect as GeometryRect,
  edgePath,
  inputPortPosition,
  isNodeVisible,
  outputPortPosition,
  visibleWorldRect,
} from './geometry';

/**
 * The Skia renderer.
 *
 * Skia draws with raw colour values rather than classNames, so every colour comes from
 * `useTheme()` (ADR 0004). A hardcoded hex here would be the one part of the app that
 * ignores dark mode.
 *
 * Everything is drawn inside one `Group` carrying the camera transform. That is what keeps
 * pan and zoom cheap: the transform changes, not the geometry, so no path is rebuilt while
 * the user drags.
 */

export type PortsByType = ReadonlyMap<
  string,
  { readonly outputs: readonly string[]; readonly inputs: readonly string[] }
>;

export type CanvasSceneProps = {
  readonly width: number;
  readonly height: number;
  readonly camera: Camera;
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly Edge[];
  readonly portsByType: PortsByType;
  readonly selectedNodeId: string | null;
  readonly nodeStates: Readonly<Record<string, NodeState>>;
  readonly theme: Theme;
  /** An edge being drawn, from a port to the finger. */
  readonly pendingEdge: { readonly from: Point; readonly to: Point } | null;
};

/**
 * Colour for a node's border, by run state.
 *
 * Run state overrides selection, deliberately: while a workflow is running, what the user
 * needs to see is which step is live, not which node they last tapped.
 */
const nodeBorderColour = (
  theme: Theme,
  state: NodeState | undefined,
  selected: boolean,
): string => {
  switch (state) {
    case 'running':
      return theme.colors.warning;
    case 'succeeded':
      return theme.colors.success;
    case 'failed':
      return theme.colors.danger;
    case 'skipped':
      return theme.colors.textMuted;
    default:
      return selected ? theme.colors.nodeSelected : theme.colors.nodeBorder;
  }
};

export const CanvasScene = ({
  width,
  height,
  camera,
  nodes,
  edges,
  portsByType,
  selectedNodeId,
  nodeStates,
  theme,
  pendingEdge,
}: CanvasSceneProps) => {
  // A monospaced system font would be ideal, but Skia needs a font file and shipping one is
  // a size cost for labels the RN layer can draw better anyway. Node labels are rendered as
  // RN Text overlaid on the canvas; Skia draws only the shapes.
  const font = useFont(null, 12);

  const view = visibleWorldRect(camera, width, height);

  const visibleNodes = nodes.filter((node) => isNodeVisible(node, view));

  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  return (
    <Canvas style={{ width, height }}>
      <Rect x={0} y={0} width={width} height={height} color={theme.colors.canvasBackground} />

      <Group
        transform={[
          { scale: camera.scale },
          { translateX: camera.translateX },
          { translateY: camera.translateY },
        ]}
      >
        <CanvasGrid view={view} colour={theme.colors.canvasGrid} />

        {/* Edges first, so a node always covers the line arriving at it rather than the
            line crossing the node body. */}
        {edges.map((edge) => {
          const source = nodesById.get(edge.source);
          const target = nodesById.get(edge.target);
          if (source === undefined || target === undefined) return null;

          const sourcePorts = portsByType.get(source.type);
          const targetPorts = portsByType.get(target.type);
          if (sourcePorts === undefined || targetPorts === undefined) return null;

          const outputIndex = sourcePorts.outputs.indexOf(edge.sourceHandle);
          const inputIndex = targetPorts.inputs.indexOf(edge.targetHandle);

          // An edge on a handle the node no longer has is skipped rather than drawn to the
          // origin, which would appear as a line shooting to the top-left corner.
          if (outputIndex === -1 || inputIndex === -1) return null;

          const from = outputPortPosition(source, outputIndex, sourcePorts.outputs.length);
          const to = inputPortPosition(target, inputIndex, targetPorts.inputs.length);

          const active =
            nodeStates[edge.source] === 'succeeded' && nodeStates[edge.target] !== undefined;

          return (
            <Path
              key={edge.id}
              path={Skia.Path.MakeFromSVGString(edgePath(from, to))!}
              style="stroke"
              strokeWidth={active ? 2.5 : 1.5}
              color={active ? theme.colors.edgeActive : theme.colors.edge}
            />
          );
        })}

        {pendingEdge !== null && (
          <Path
            path={Skia.Path.MakeFromSVGString(edgePath(pendingEdge.from, pendingEdge.to))!}
            style="stroke"
            strokeWidth={2}
            color={theme.colors.edgeActive}
          />
        )}

        {visibleNodes.map((node) => {
          const ports = portsByType.get(node.type);
          const selected = node.id === selectedNodeId;
          const state = nodeStates[node.id];

          return (
            <Group key={node.id}>
              <RoundedRect
                x={node.metadata.position.x}
                y={node.metadata.position.y}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                r={theme.radii.md}
                color={theme.colors.nodeSurface}
              />
              <RoundedRect
                x={node.metadata.position.x}
                y={node.metadata.position.y}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                r={theme.radii.md}
                style="stroke"
                strokeWidth={selected || state !== undefined ? 2.5 : 1}
                color={nodeBorderColour(theme, state, selected)}
              />

              {ports?.inputs.map((handle, index) => {
                const position = inputPortPosition(node, index, ports.inputs.length);
                return (
                  <Circle
                    key={`in-${handle}`}
                    c={vec(position.x, position.y)}
                    r={PORT_RADIUS}
                    color={theme.colors.edge}
                  />
                );
              })}

              {ports?.outputs.map((handle, index) => {
                const position = outputPortPosition(node, index, ports.outputs.length);
                return (
                  <Circle
                    key={`out-${handle}`}
                    c={vec(position.x, position.y)}
                    r={PORT_RADIUS}
                    color={theme.colors.primary}
                  />
                );
              })}

              {font !== null && (
                <SkiaText
                  x={node.metadata.position.x + 12}
                  y={node.metadata.position.y + 26}
                  text={truncate(node.metadata.label, 20)}
                  font={font}
                  color={theme.colors.textPrimary}
                />
              )}
              {font !== null && (
                <SkiaText
                  x={node.metadata.position.x + 12}
                  y={node.metadata.position.y + 46}
                  text={truncate(node.type, 22)}
                  font={font}
                  color={theme.colors.textMuted}
                />
              )}
            </Group>
          );
        })}
      </Group>
    </Canvas>
  );
};

/**
 * The background grid.
 *
 * Drawn as one path rather than many lines, because a separate node per line would mean
 * hundreds of Skia elements reconciled on every zoom. Only the visible span is generated,
 * so zooming out does not multiply the work.
 */
const CanvasGrid = ({ view, colour }: { readonly view: GeometryRect; readonly colour: string }) => {
  const path = Skia.Path.Make();

  const startX = Math.floor(view.x / GRID_SIZE) * GRID_SIZE;
  const endX = view.x + view.width;
  const startY = Math.floor(view.y / GRID_SIZE) * GRID_SIZE;
  const endY = view.y + view.height;

  // Bounded: at maximum zoom-out the visible span is large, and an unbounded loop here would
  // freeze the canvas rather than degrade it.
  const maxLines = 400;
  let lines = 0;

  for (let x = startX; x <= endX && lines < maxLines; x += GRID_SIZE, lines++) {
    path.moveTo(x, startY);
    path.lineTo(x, endY);
  }

  lines = 0;
  for (let y = startY; y <= endY && lines < maxLines; y += GRID_SIZE, lines++) {
    path.moveTo(startX, y);
    path.lineTo(endX, y);
  }

  return <Path path={path} style="stroke" strokeWidth={0.5} color={colour} />;
};

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;
