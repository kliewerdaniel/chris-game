"use client";

import { useRef } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import type { GraphNode, GraphState } from "../lib/reconstruction/graph";

/**
 * D4 — GraphConstellation (R3F v9).
 *
 * Renders the investigation graph as a 3D constellation: every fact/claim/place/
 * person is a node suspended in space, edges thread them together, and
 * contradictions glow as hot tension threads. Clickable -> opens the same
 * epistemic detail panel as the room fragments (no new logic; a node's
 * treatment is read off its status exactly as the ledger does).
 *
 * Pure-visual layer: consumes the deterministic `GraphState` from
 * `lib/reconstruction/graph.ts`. No engine mutation. Reduced-motion (§9 floor)
 * freezes node bob + edge pulse.
 */

// Epistemic tint per status — mirrors ReconstructionScene's grammar.
function nodeColor(n: GraphNode): string {
  if (n.status === "canonical" || n.status === "inferred" || n.status === "observation")
    return "#e8eef0";
  if (n.status === "testimony") return "#c8a24a";
  if (n.status === "belief") return "#9fb6c2";
  if (n.status === "hypothesis") return "#8fd0c4";
  if (n.status === "rumor") return "#b98a3a";
  return "#cdd6da";
}

const noRaycast = () => null;

function GraphNodeMesh({
  n,
  selected,
  onSelect,
  reducedMotion,
}: {
  n: GraphNode;
  selected: boolean;
  onSelect: (n: GraphNode | null) => void;
  reducedMotion: boolean;
}) {
  const ref = useRef<any>(null);
  const color = nodeColor(n);
  // Deterministic bob from the id hash (no randomness); gated by reduced motion.
  const phase = (n.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 100) / 100;

  useFrame((state) => {
    if (!ref.current) return;
    if (!reducedMotion) {
      const t = state.clock.elapsedTime;
      ref.current.position.y = n.position.y + Math.sin(t * 0.4 + phase * 6.28) * 0.05;
    } else {
      ref.current.position.y = n.position.y;
    }
  });

  const r = n.size * (selected ? 1.5 : 1) * 0.09;

  return (
    <mesh
      ref={ref}
      position={[n.position.x, n.position.y, n.position.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(selected ? null : n);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <sphereGeometry args={[r, 20, 20]} />
      <meshStandardMaterial
        color={selected ? "#f2f6f8" : color}
        emissive={n.authored ? "#1d4f48" : "#101418"}
        emissiveIntensity={selected ? 0.9 : n.authored ? 0.5 : 0.18}
        transparent
        opacity={0.92}
        roughness={0.45}
        metalness={0.2}
      />
    </mesh>
  );
}

function GraphScene({
  graph,
  selected,
  onSelect,
  reducedMotion,
}: {
  graph: GraphState;
  selected: GraphNode | null;
  onSelect: (n: GraphNode | null) => void;
  reducedMotion: boolean;
}) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return (
    <group>
      <ambientLight intensity={0.4} />
      <pointLight position={[2, 3, 4]} intensity={1.1} />
      <pointLight position={[-3, -2, -2]} intensity={0.4} color="#c8a24a" />

      {/* edges — thin cool threads (non-interactive so they never steal clicks) */}
      {graph.edges
        .filter((e) => !e.tension)
        .map((e, i) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          return (
            <Line
              key={`e${i}`}
              points={[
                [a.position.x, a.position.y, a.position.z],
                [b.position.x, b.position.y, b.position.z],
              ]}
              color="#3a4a52"
              lineWidth={1}
              transparent
              opacity={0.35}
              raycast={noRaycast}
            />
          );
        })}

      {/* tension edges — hot, pulsing; the contradiction made visible */}
      {graph.edges
        .filter((e) => e.tension)
        .map((e, i) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          return (
            <Line
              key={`t${i}`}
              points={[
                [a.position.x, a.position.y, a.position.z],
                [b.position.x, b.position.y, b.position.z],
              ]}
              color="#c8553d"
              lineWidth={2}
              transparent
              opacity={0.7}
              raycast={noRaycast}
            />
          );
        })}

      {/* nodes */}
      {graph.nodes.map((n) => (
        <GraphNodeMesh
          key={n.id}
          n={n}
          selected={selected?.id === n.id}
          onSelect={onSelect}
          reducedMotion={reducedMotion}
        />
      ))}

      <OrbitControls enablePan={false} minDistance={1.5} maxDistance={6} />
    </group>
  );
}

export default function GraphConstellation({
  graph,
  selected,
  onSelect,
  reducedMotion,
}: {
  graph: GraphState;
  selected: GraphNode | null;
  onSelect: (n: GraphNode | null) => void;
  reducedMotion: boolean;
}) {
  return (
    <GraphScene
      graph={graph}
      selected={selected}
      onSelect={onSelect}
      reducedMotion={reducedMotion}
    />
  );
}

// Keep ThreeElements referenced for typing parity.
export type _ThreeElements = ThreeElements;
