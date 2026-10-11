import type { AgentId, AgentState } from "@/lib/engine/types";

type NodeSpec = { id: AgentId; x: number; y: number; title: string; role: string };

const nodes: NodeSpec[] = [
  { id: "coordinator", x: 320, y: 20, title: "Coordinator", role: "plans, settles disagreements" },
  { id: "investigation", x: 110, y: 170, title: "Investigation", role: "finds the cause" },
  { id: "resolution", x: 320, y: 170, title: "Resolution", role: "fixes, then verifies" },
  { id: "closure", x: 530, y: 170, title: "Closure", role: "documents, informs" },
];

const W = 176;
const H = 60;

const wires: { to: AgentId; d: string }[] = [
  { to: "investigation", d: "M 320 80 C 320 125, 110 125, 110 170" },
  { to: "resolution", d: "M 320 80 L 320 170" },
  { to: "closure", d: "M 320 80 C 320 125, 530 125, 530 170" },
];

const stateText: Record<AgentState, string> = {
  idle: "idle",
  active: "working",
  waiting: "waiting",
  done: "done",
  error: "failed",
};

const stateColor: Record<AgentState, string> = {
  idle: "text-white/25",
  active: "text-[color:var(--tone)]",
  waiting: "text-teal/70",
  done: "text-lime",
  error: "text-ember",
};

// The live agent graph. Each node follows the state events the engine emits.
export function AgentGraph({ agents }: { agents: Record<AgentId, AgentState> }) {
  return (
    <svg viewBox="0 0 640 250" role="img" aria-label="Agent graph: the Coordinator directs the Investigation, Resolution and Closure workers" className="w-full">
      <defs>
        <filter id="node-glow" x="-30%" y="-50%" width="160%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {wires.map((wire) => {
        const active = agents[wire.to] === "active";
        const done = agents[wire.to] === "done";
        return (
          <g key={wire.to}>
            <path d={wire.d} fill="none" stroke="currentColor" strokeWidth="1.5" className={done ? "text-lime/50" : active ? "text-[color:var(--tone)]" : "text-white/15"} />
            {active && (
              <path
                d={wire.d}
                fill="none"
                stroke="var(--tone)"
                strokeWidth="4"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="0.06 1"
                strokeDashoffset="0.06"
                className="animate-pulse-travel"
                style={{ filter: "drop-shadow(0 0 6px var(--tone))" }}
              />
            )}
          </g>
        );
      })}

      {nodes.map((node) => {
        const state = agents[node.id];
        const live = state === "active";
        return (
          <g key={node.id} transform={`translate(${node.x - W / 2} ${node.y})`} className={stateColor[state]} filter={live ? "url(#node-glow)" : undefined}>
            <rect
              width={W}
              height={H}
              rx="2"
              fill="rgb(11 14 12 / 0.85)"
              stroke="currentColor"
              strokeWidth={live ? 1.75 : 1}
              strokeDasharray={state === "waiting" ? "4 4" : undefined}
            />
            <text x="14" y="25" fill="#f2f5ee" fontSize="14" fontWeight="600" className="font-display">
              {node.title}
            </text>
            <text x="14" y="42" fill="#9ba39a" fontSize="10.5" className="font-sans">
              {node.role}
            </text>
            <text x={W - 12} y="17" textAnchor="end" fill="currentColor" fontSize="9" letterSpacing="1.4" className="font-mono uppercase">
              {stateText[state]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
