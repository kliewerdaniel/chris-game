"use client";

import { useMemo, useRef } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { buildPlayerGraph, type PlayerGraphNode, type PlayerGraphEdge } from "../lib/core/player-graph";
import type { WorldState } from "../lib/core/types";

/**
 * M2 — Memory Palace: the player's own reconstruction graph rendered as space.
 *
 * This is NOT the canonical investigation web (that is "the web" mode). It is
 * the player's mutable model of Chris — every node a hypothesis they authored,
 * every edge a relation THEY asserted. The engine evaluates each node/edge
 * against the canonical record and reports a verdict (corroborated / divergent
 * / unanchored), but it never tells the player what to believe. The Palace is a
 * model, not a verdict.
 *
 * Deterministic: node placement is a pure function of index (circle layout),
 * so the same graph always renders identically. Drift uses time only and is
 * gated by reduced-motion.
 */

// Verdict -> visual grammar (carries the epistemic boundary into the space).
const VERDICT_STYLE: Record<string, { color: string; stitched: boolean; emissive: string }> = {
  unanchored: { color: "#7d8794", stitched: true, emissive: "#1a1f24" },
  corroborated: { color: "#cfe6ea", stitched: false, emissive: "#101418" },
  divergent: { color: "#c8a24a", stitched: true, emissive: "#5a3d12" },
};
const ALIGN_STYLE: Record<string, string> = {
  corroborates: "#5a7d6a",
  diverges: "#a35a4a",
  new: "#5a6a8a",
};

function nodePosition(index: number, total: number, radius = 1.4): [number, number, number] {
  if (total <= 1) return [0, 0, 0];
  const a = (index / total) * Math.PI * 2;
  return [Math.cos(a) * radius, Math.sin(a) * radius, 0];
}

function NodeMesh({ n, pos, selected, onSelect, reducedMotion }: { n: PlayerGraphNode; pos: [number, number, number]; selected: boolean; onSelect: (n: PlayerGraphNode | null) => void; reducedMotion: boolean }) {
  const ref = useRef<any>(null);
  const style = (n.verdict && VERDICT_STYLE[n.verdict]) || VERDICT_STYLE.unanchored;
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    // Unanchored nodes drift slowly; corroborated/divergent hold position.
    if (n.verdict === "unanchored" && !reducedMotion) {
      ref.current.position.x = pos[0] + Math.sin(t * 0.3 + pos[1]) * 0.05;
      ref.current.position.y = pos[1] + Math.cos(t * 0.23 + pos[0]) * 0.05;
      ref.current.position.z = pos[2];
    } else if (ref.current) {
      ref.current.position.set(pos[0], pos[1], pos[2]);
    }
  });
  return (
    <group>
      <mesh
        ref={ref}
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
        <icosahedronGeometry args={[0.09, 0]} />
        <meshStandardMaterial
          color={selected ? "#f2f6f8" : style.color}
          emissive={style.emissive}
          emissiveIntensity={selected ? 0.9 : 0.4}
          wireframe={style.stitched}
          transparent
          opacity={0.85}
        />
      </mesh>
      <Text position={[pos[0], pos[1] - 0.18, pos[2]]} fontSize={0.05} color={style.color} anchorX="center" maxWidth={0.8}>
        {n.text.length > 40 ? n.text.slice(0, 38) + "…" : n.text}
      </Text>
    </group>
  );
}

function EdgeLine({ from, to, alignment }: { from: [number, number, number]; to: [number, number, number]; alignment: string }) {
  const points = useMemo(() => [from, to], [from, to]);
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[new Float32Array([...from, ...to]), 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={ALIGN_STYLE[alignment] ?? ALIGN_STYLE.new} transparent opacity={0.5} />
    </line>
  );
}

export default function MemoryPalace({ ws, selected, onSelect, reducedMotion }: { ws: WorldState; selected: PlayerGraphNode | null; onSelect: (n: PlayerGraphNode | null) => void; reducedMotion: boolean }) {
  const graph = useMemo(() => buildPlayerGraph(ws), [ws]);
  const positions = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    graph.nodes.forEach((n, i) => map.set(n.id, nodePosition(i, graph.nodes.length)));
    return map;
  }, [graph.nodes]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 0, 3]} intensity={1.0} />
      {graph.edges.map((e: PlayerGraphEdge) => {
        const a = positions.get(e.from);
        const b = positions.get(e.to);
        if (!a || !b) return null;
        return <EdgeLine key={e.id} from={a} to={b} alignment={e.alignment ?? "new"} />;
      })}
      {graph.nodes.map((n, i) => {
        const p = positions.get(n.id)!;
        return <NodeMesh key={n.id} n={n} pos={p} selected={selected?.id === n.id} onSelect={onSelect} reducedMotion={reducedMotion} />;
      })}
      {graph.nodes.length === 0 && (
        <Text position={[0, 0, 0]} fontSize={0.08} color="#888" anchorX="center">
          your reconstruction is empty — hypothesize to begin
        </Text>
      )}
    </>
  );
}

export type _ThreeElements = ThreeElements;
