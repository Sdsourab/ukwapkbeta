import { BaseEdge, EdgeLabelRenderer, Handle, NodeResizer, Position, getBezierPath, getSmoothStepPath, getStraightPath, useInternalNode, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { boundaryPoint } from '@ukw/graph-engine';
import { isHexColour, type GraphNodeRecord } from '@ukw/domain';
import { Icon } from '@ukw/ui';
import { useStore } from '../store-context';

export type UkwNodeData = { rec: GraphNodeRecord; match: boolean; [key: string]: unknown };
export type UkwFlowNode = Node<UkwNodeData, 'ukw'>;

const safeColour = (c?: string) => (isHexColour(c) ? c : undefined);

export function UkwNode({ data, selected }: NodeProps<UkwFlowNode>) {
  const store = useStore();
  const rec = data.rec;
  const colour = safeColour(rec.colour);
  const style = colour ? ({ ['--n-bg' as string]: `color-mix(in srgb, ${colour} 38%, var(--ukw-surface))` } as React.CSSProperties) : undefined;

  if (rec.type === 'group') {
    return (
      <>
        <NodeResizer isVisible={selected} minWidth={140} minHeight={90}
          onResizeEnd={(_, p) => { void store.graphs.moveNodes([{ id: rec.id, position: { x: p.x, y: p.y } }]).then(() => store.graphs.resizeNode(rec.id, { width: p.width, height: p.height })); }} />
        <div className="ukw-node ukw-node--group" data-shape="rounded" style={{ ...style, borderColor: colour ?? undefined }}>{rec.label}</div>
      </>
    );
  }
  return (
    <div className={`ukw-node${data.match ? ' is-match' : ''}`} data-shape={rec.shape} data-type={rec.type} style={style} title={rec.body || undefined}>
      <Handle id="t" type="source" position={Position.Top} />
      <Handle id="r" type="source" position={Position.Right} />
      <Handle id="b" type="source" position={Position.Bottom} />
      <Handle id="l" type="source" position={Position.Left} />
      {rec.label || <span className="muted">Empty node</span>}
      {rec.sourceRef?.documentId || rec.sourceRef?.annotationId ? <span className="ukw-node__tag" aria-label="Linked to a source"><Icon name="link" size={12} /></span> : null}
    </div>
  );
}

/** Floating edge: attaches to the node boundary facing the other node, so no handle ids need to be stored. */
export function FloatingEdge({ id, source, target, markerEnd, style, label, data, selected }: EdgeProps) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t) return null;
  const dim = (n: NonNullable<typeof s>) => ({ position: n.internals.positionAbsolute, dimensions: { width: n.measured.width ?? 180, height: n.measured.height ?? 64 } });
  const sd = dim(s), td = dim(t);
  const sc = { x: sd.position.x + sd.dimensions.width / 2, y: sd.position.y + sd.dimensions.height / 2 };
  const tc = { x: td.position.x + td.dimensions.width / 2, y: td.position.y + td.dimensions.height / 2 };
  const a = boundaryPoint(sd, tc), b = boundaryPoint(td, sc);
  const horizontal = Math.abs(tc.x - sc.x) > Math.abs(tc.y - sc.y);
  const sp = horizontal ? (tc.x > sc.x ? Position.Right : Position.Left) : tc.y > sc.y ? Position.Bottom : Position.Top;
  const tp = horizontal ? (tc.x > sc.x ? Position.Left : Position.Right) : tc.y > sc.y ? Position.Top : Position.Bottom;
  const params = { sourceX: a.x, sourceY: a.y, targetX: b.x, targetY: b.y, sourcePosition: sp, targetPosition: tp };
  const connector = (data as { connector?: string } | undefined)?.connector;
  const [path, lx, ly] = connector === 'straight' ? getStraightPath(params) : connector === 'orthogonal' ? getSmoothStepPath(params) : getBezierPath(params);
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, strokeWidth: selected ? 3 : 2 }} interactionWidth={28} />
      {label ? (
        <EdgeLabelRenderer>
          <div className="nodrag nopan" style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`, background: 'var(--ukw-surface)', color: 'var(--ukw-text)', border: '1px solid var(--ukw-border)', borderRadius: 8, padding: '1px 8px', fontSize: 12, pointerEvents: 'all' }}>{label}</div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
