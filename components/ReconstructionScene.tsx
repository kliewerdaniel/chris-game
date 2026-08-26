"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeElements } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { buildReconstructionState } from "../lib/reconstruction/state";
import type { ReconstructionState, ReconFragment } from "../lib/reconstruction/state";
import type { WorldState } from "../lib/core/types";

/**
 * ADR-014 Phase B — R3F reconstruction visual.
 *
 * Renders the reconstruction as a field of fragments suspended in space, driven
 * ENTIRELY by the existing deterministic `buildReconstructionState` adapter.
 * No new epistemic logic: a fragment's treatment is read off its `status` + the
 * provenance's `sourceType`, exactly as the ledger does.
 *
 * Visual grammar (carries the Two-Chris gap):
 *   - canonical / inferred / observation  -> solid, settled, cool white
 *   - testimony (corpus/Reddit mythos)     -> warm, with a visible "stitched"
 *                                             glitch (vertex jitter, flicker)
 *   - belief / hypothesis / rumor          -> dim, drifting
 *   - anchored fragments hold position; unanchored ones drift slowly.
 *
 * Deterministic boundary: `WorldState -> buildReconstructionState -> <this>`.
 * Same inputs -> same scene (no Math.random in placement; drift uses time only).
 */

// Strongest source types -> "real Chris bone" (solid).
const SOLID_SOURCE = new Set(["reddit", "author", "compiled_event"]);
const MYTHOS_SOURCE = new Set(["conversation"]);

function fragmentTreatment(f: ReconFragment): {
  solid: boolean;
  stitched: boolean;
  color: string;
} {
  if (f.status === "canonical" || f.status === "inferred" || f.status === "observation") {
    return { solid: true, stitched: false, color: "#e8eef0" };
  }
  const src = f.provenance?.sourceType;
  if (src && SOLID_SOURCE.has(src)) {
    return { solid: true, stitched: false, color: "#cfe6ea" };
  }
  if (src && MYTHOS_SOURCE.has(src)) {
    return { solid: false, stitched: true, color: "#c8a24a" };
  }
  // testimony / belief / hypothesis / rumor without a clear source -> mythos-tinted
  return { solid: false, stitched: true, color: "#b98a3a" };
}

function FragmentMesh({ f, selected, onSelect }: { f: ReconFragment; selected: boolean; onSelect: (f: ReconFragment | null) => void }) {
  const ref = useRef<any>(null);
  const { solid, stitched, color } = fragmentTreatment(f);
  // Deterministic jitter from the fragment seed (no randomness at placement).
  const jitter = useMemo(() => {
    const s = f.seed;
    return {
      x: (s - 0.5) * 0.04,
      y: ((s * 7.13) % 1 - 0.5) * 0.04,
      z: ((s * 3.71) % 1 - 0.5) * 0.04,
    };
  }, [f.seed]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    // Anchored -> still. Unanchored -> slow deterministic drift.
    if (!f.anchored) {
      ref.current.position.x = f.region.x + Math.sin(t * 0.3 + f.seed * 6.28) * 0.06;
      ref.current.position.y = f.region.y + Math.cos(t * 0.23 + f.seed * 6.28) * 0.06;
      ref.current.position.z = f.region.z + Math.sin(t * 0.19 + f.seed * 3.14) * 0.06;
    }
    // Stitched (mythos) fragments flicker their scale to read as "unstable weave".
    if (stitched && ref.current) {
      const flick = 1 + Math.sin(t * 2.3 + f.seed * 12) * 0.05;
      ref.current.scale.setScalar(f.size * (selected ? 1.4 : 1) * flick);
    } else if (ref.current) {
      ref.current.scale.setScalar(f.size * (selected ? 1.4 : 1));
    }
  });

  const geometry = solid ? "icosahedron" : "box";
  const args = solid ? [0.08, 0] : [0.12, 0.12, 0.12];

  return (
    <group position={[f.region.x + jitter.x, f.region.y + jitter.y, f.region.z + jitter.z]}>
      <mesh
        ref={ref}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect(selected ? null : f);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        {geometry === "icosahedron" ? (
          <icosahedronGeometry args={args as [number, number]} />
        ) : (
          <boxGeometry args={args as [number, number, number]} />
        )}
        <meshStandardMaterial
          color={selected ? "#f2f6f8" : color}
          emissive={stitched ? "#5a3d12" : "#101418"}
          emissiveIntensity={selected ? 0.9 : stitched ? 0.6 : 0.15}
          transparent
          opacity={Math.max(0.22, f.opacity)}
          roughness={solid ? 0.4 : 0.9}
          metalness={solid ? 0.3 : 0.1}
          wireframe={stitched}
        />
      </mesh>
    </group>
  );
}

function Scene({ ws, selected, onSelect }: { ws: WorldState; selected: ReconFragment | null; onSelect: (f: ReconFragment | null) => void }) {
  const recon: ReconstructionState = useMemo(() => buildReconstructionState(ws), [ws]);
  const frags = recon.fragments;
  return (
    <>
      <ambientLight intensity={0.35} />
      <pointLight position={[2, 3, 4]} intensity={1.1} />
      <pointLight position={[-3, -2, -2]} intensity={0.4} color="#c8a24a" />
      {frags.map((f) => (
        <FragmentMesh key={f.id} f={f} selected={selected?.id === f.id} onSelect={onSelect} />
      ))}
      {/* faint core sphere marking the reconstruction's center of mass */}
      <mesh>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshBasicMaterial color="#c8a24a" transparent opacity={0.25} />
      </mesh>
      <OrbitControls enablePan={false} minDistance={1.2} maxDistance={4} />
      {frags.length === 0 && (
        <Text position={[0, 0, 0]} fontSize={0.08} color="#888" anchorX="center">
          nothing reconstructed yet
        </Text>
      )}
    </>
  );
}

export default function ReconstructionScene({ ws }: { ws: WorldState | null }) {
  const [selected, setSelected] = useState<ReconFragment | null>(null);
  if (!ws) return null;
  return (
    <div className="recon-scene" aria-label="reconstruction visual">
      <Canvas camera={{ position: [0, 0, 2.4], fov: 50 }} dpr={[1, 2]}>
        <color attach="background" args={["#0a0a0c"]} />
        <Scene ws={ws} selected={selected} onSelect={setSelected} />
      </Canvas>
      <div className="recon-legend">
        <span className="lg solid">■ real Chris bone (canonical)</span>
        <span className="lg stitched">□ stitched from mythos</span>
        <span className="lg dim">· unanchored / drifting</span>
      </div>
      {selected && (
        <div className="recon-detail" role="note" aria-label="selected fragment source">
          <button
            type="button"
            className="recon-detail-close"
            aria-label="close"
            onClick={() => setSelected(null)}
          >
            ×
          </button>
          <div className="recon-detail-kind">{sourceLabel(selected)}</div>
          <div className="recon-detail-text">{selected.label}</div>
          {selected.provenance?.quote && (
            <blockquote className="recon-detail-quote">{selected.provenance.quote}</blockquote>
          )}
          {selected.claimedBy && (
            <div className="recon-detail-meta">claimed by: {selected.claimedBy}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** Epistemic-framed source label — never asserts world-truth. */
function sourceLabel(f: ReconFragment): string {
  const src = f.provenance?.sourceType;
  if (f.status === "canonical" || f.status === "inferred" || f.status === "observation") {
    return `canonical · ${src ?? "real Chris"}`;
  }
  if (src === "conversation") return "mythos (reconstruction's delusion)";
  if (src === "reddit" || src === "author" || src === "compiled_event") return `source · ${src}`;
  return f.status;
}

// Keep ThreeElements referenced for typing parity (avoids unused-import lint churn).
export type _ThreeElements = ThreeElements;
