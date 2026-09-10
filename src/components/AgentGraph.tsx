import { memo, useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { buildGraph } from '../lib/mapping';
import { roleMeta, type AgentInfo } from '../lib/mapping';
import { useMission } from '../store';

const STATE_DOT: Record<string, string> = {
  idle: '#5b6478',
  thinking: '#7aa2ff',
  researching: '#7aa2ff',
  reading: '#6fd3c7',
  editing: '#c9a35c',
  executing: '#e08a5c',
  testing: '#b48ce8',
  reviewing: '#8fd18f',
  waiting: '#d1c26a',
  success: '#6fce8f',
  error: '#e56c6c',
};

function AgentNodeView({ data }: NodeProps) {
  const { agent, selected } = data as unknown as { agent: AgentInfo; selected: boolean };
  const meta = roleMeta(agent.id);
  const dot = STATE_DOT[agent.state] ?? '#5b6478';
  return (
    <div
      className={`agent-node state-${agent.state}${selected ? ' selected' : ''}`}
      style={{ ['--dot' as string]: dot }}
    >
      <Handle type="target" position={Position.Top} className="port" />
      <div className="agent-top">
        <span className="agent-glyph" aria-hidden>{meta.glyph}</span>
        <span className="agent-name">{agent.id.toUpperCase()}</span>
        <span className="agent-dot" aria-label={agent.state} />
      </div>
      <div className="agent-role">{agent.role}</div>
      <div className="agent-model">{agent.model}{agent.variant !== '—' ? ` · ${agent.variant}` : ''}</div>
      <div className="agent-activity">{agent.activity ?? agent.state.toUpperCase()}</div>
      <Handle type="source" position={Position.Bottom} className="port" />
    </div>
  );
}

const MemoAgentNode = memo(AgentNodeView);

export default function AgentGraph() {
  const agents = useMission((s) => s.agents);
  const selectedId = useMission((s) => s.selectedId);
  const select = useMission((s) => s.select);
  const animations = useMission((s) => s.settings.animations);

  const list = useMemo(() => Object.values(agents), [agents]);
  const graph = useMemo(() => buildGraph(list), [list]);

  const nodes: Node[] = useMemo(
    () =>
      graph.nodes.map((n) => {
        const agent = agents[n.id];
        return {
          id: n.id,
          type: 'agent',
          position: { x: n.x, y: n.y },
          data: { agent, selected: selectedId === n.id },
        };
      }),
    [graph, agents, selectedId],
  );

  const edges: Edge[] = useMemo(
    () =>
      graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: animations && e.active,
        className: e.active ? 'edge-active' : 'edge-idle',
      })),
    [graph, animations],
  );

  if (list.length === 0) {
    return (
      <div className="graph-empty">
        <div className="graph-empty-title">NO AGENTS OBSERVED YET</div>
        <p>Connect to OpenCode and run a task. Agents appear here as real telemetry arrives — nothing is simulated.</p>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={{ agent: MemoAgentNode }}
      onNodeClick={(_, n) => select(n.id)}
      onPaneClick={() => select(null)}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.3}
      maxZoom={1.75}
      proOptions={{ hideAttribution: false }}
      colorMode="dark"
      className={animations ? '' : 'no-anim'}
    >
      <Background gap={28} size={1.2} className="cmd-bg" />
      <MiniMap pannable zoomable className="cmd-minimap" />
      <Controls position="bottom-left" />
    </ReactFlow>
  );
}
