import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Snapshot, Work } from '@aether/contracts';
import { useTheme } from '../../lib/preferences/state.js';
import { Badge } from '../../ui/Badge.js';
import { useT } from '../../ui/useT.js';
import { taskPositions } from './taskGraph.js';
type TaskNode = Node<{ work: Work; onSelect: (work: Work) => void }, 'task'>;
function TaskNodeView({ data }: NodeProps<TaskNode>) {
  return (
    <div className="dag-task">
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <button
        className="nodrag nopan"
        onClick={(event) => {
          event.stopPropagation();
          data.onSelect(data.work);
        }}
        title={data.work.title}
      >
        <strong>{data.work.title}</strong>
        <Badge state={data.work.state} />
        <small>
          P{data.work.priority} · {data.work.attempt}/{data.work.maxAttempts}
        </small>
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
const nodeTypes = { task: TaskNodeView };
type TaskDagProps = {
  snapshot: Snapshot;
  onSelect: (work: Work) => void;
};

function taskGraph(snapshot: Snapshot, onSelect: (work: Work) => void) {
  try {
    const positions = taskPositions(
      snapshot.work.map((w) => w.id),
      snapshot.dependencies,
    );
    return {
      nodes: snapshot.work.map((work) => {
        const position = positions.get(work.id);
        if (!position) throw new Error('task layout missing node');
        return {
          id: work.id,
          type: 'task' as const,
          position,
          data: { work, onSelect },
          style: { width: 240, height: 94 },
        };
      }),
      edges: snapshot.dependencies.map((e) => ({
        id: `${e.dependsOn}:${e.workId}`,
        source: e.dependsOn,
        target: e.workId,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#63939b', strokeWidth: 2 },
      })),
    };
  } catch {
    return null;
  }
}

export function TaskDag({ snapshot, onSelect }: TaskDagProps) {
  const t = useT();
  const theme = useTheme();
  const graph = useMemo(() => {
    return taskGraph(snapshot, onSelect);
  }, [snapshot.work, snapshot.dependencies, onSelect]);
  if (!graph) return <p role="alert">{t('dagInvalid')}</p>;
  return (
    <>
      <p className="muted">{t('dagHint')}</p>
      <div className="task-dag" aria-label={t('dag')}>
        <ReactFlow<TaskNode>
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => onSelect(node.data.work)}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          fitView
          minZoom={0.15}
          maxZoom={1.5}
          colorMode={theme}
          ariaLabelConfig={{
            'controls.zoomIn.ariaLabel': t('dagZoomIn'),
            'controls.zoomOut.ariaLabel': t('dagZoomOut'),
            'controls.fitView.ariaLabel': t('dagFit'),
          }}
        >
          <Background color="#34505b" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </>
  );
}
