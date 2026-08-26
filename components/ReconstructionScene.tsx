"use client";

import { useMemo, useRef, useState, Suspense } from "react";
import { Canvas, useFrame, type ThreeElements } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { buildReconstructionState } from "../lib/reconstruction/state";
import { buildRoomState } from "../lib/reconstruction/room";
import RoomEnvironment from "./RoomEnvironment";
import type { ReconstructionState, ReconFragment, Vec3 } from "../lib/reconstruction/state";
import type { RoomState } from "../lib/reconstruction/room";
import type { WorldState } from "../lib/core/types";

/** Read prefers-reduced-motion (SSR-safe). */
function usePrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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

function FragmentMesh({ f, selected, onSelect, home, reducedMotion }: { f: ReconFragment; selected: boolean; onSelect: (f: ReconFragment | null) => void; home: Vec3; reducedMotion: boolean }) {
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
    // Anchored -> still. Unanchored -> slow deterministic drift around the home
    // position (gated by reduced motion). Drift is LOCAL to the group (which sits
    // at `home`); canonical/anchored fragments therefore stay at the room center.
    if (!f.anchored && !reducedMotion) {
      ref.current.position.x = Math.sin(t * 0.3 + f.seed * 6.28) * 0.06;
      ref.current.position.y = Math.cos(t * 0.23 + f.seed * 6.28) * 0.06;
      ref.current.position.z = Math.sin(t * 0.19 + f.seed * 3.14) * 0.06;
    } else if (ref.current) {
      ref.current.position.set(0, 0, 0);
    }
    // Stitched (mythos) fragments flicker their scale to read as "unstable weave".
    if (stitched && ref.current) {
      const flick = reducedMotion ? 1 : 1 + Math.sin(t * 2.3 + f.seed * 12) * 0.05;
      ref.current.scale.setScalar(f.size * (selected ? 1.4 : 1) * flick);
    } else if (ref.current) {
      ref.current.scale.setScalar(f.size * (selected ? 1.4 : 1));
    }
  });

  const geometry = solid ? "icosahedron" : "box";
  const args = solid ? [0.08, 0] : [0.12, 0.12, 0.12];

  return (
    // Group sits at HOME (room adapter position) + static jitter. Canonical /
    // anchored fragments stay near the lamp (center); unanchored scatter outward.
    <group position={[home.x + jitter.x, home.y + jitter.y, home.z + jitter.z]}>
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

function Scene({ ws, selected, onSelect, reducedMotion }: { ws: WorldState; selected: ReconFragment | null; onSelect: (f: ReconFragment | null) => void; reducedMotion: boolean }) {
  const recon: ReconstructionState = useMemo(() => buildReconstructionState(ws), [ws]);
  const room: RoomState = useMemo(() => {
    const statuses: Record<string, string> = {};
    for (const f of recon.fragments) statuses[f.id] = f.status;
    return buildRoomState(ws, statuses);
  }, [ws, recon]);
  const frags = recon.fragments;
  return (
    <>
      {/* M3 — the room environment frames the reconstruction (asset-agnostic placeholder). */}
      <RoomEnvironment room={room} reducedMotion={reducedMotion} />
      <ambientLight intensity={0.35} />
      <pointLight position={[2, 3, 4]} intensity={1.1} />
      <pointLight position={[-3, -2, -2]} intensity={0.4} color="#c8a24a" />
      {frags.map((f) => {
        // Home position from the room adapter: canonical/anchored stay near the
        // lamp (center), unanchored scatter outward by status — carrying the
        // Two-Chris gap into the space. The existing e2e hits the center, so a
        // canonical fragment must remain near (0,0,0).
        const home: Vec3 = room.fragmentPositions[f.id] ?? f.region;
        return (
          <FragmentMesh key={f.id} f={f} selected={selected?.id === f.id} onSelect={onSelect} home={home} reducedMotion={reducedMotion} />
        );
      })}
      {/* faint core sphere marking the reconstruction's center of mass (decorative) */}
      <mesh raycast={() => null}>
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

export default function ReconstructionScene({ ws, onChallengeClaim }: { ws: WorldState | null; onChallengeClaim?: (factId: string) => void }) {
  const [selected, setSelected] = useState<ReconFragment | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  // DOM safety net (§9 floor): the room's spatial relations are also expressed
  // as text so the scene is never a hard WebGL wall. Not the primary view, but
  // never absent.
  const room = useMemo(() => {
    if (!ws) return null;
    const recon = buildReconstructionState(ws);
    const statuses: Record<string, string> = {};
    for (const f of recon.fragments) statuses[f.id] = f.status;
    return buildRoomState(ws, statuses);
  }, [ws]);
  if (!ws) return null;
  return (
    <div className="recon-scene" aria-label="reconstruction visual">
      <Canvas camera={{ position: [0, 0, 2.4], fov: 50 }} dpr={[1, 2]}>
        {/* <Text> suspends while its font loads; without an in-canvas Suspense
            boundary the whole R3F tree suspends and renders nothing (the canvas
            goes blank but no error is thrown). Wrap so the scene always commits. */}
        <Suspense fallback={null}>
          <color attach="background" args={["#0a0a0c"]} />
          <Scene ws={ws} selected={selected} onSelect={setSelected} reducedMotion={reducedMotion} />
        </Suspense>
      </Canvas>
      <div className="recon-legend">
        <span className="lg solid">■ real Chris bone (canonical)</span>
        <span className="lg stitched">□ stitched from mythos</span>
        <span className="lg dim">· unanchored / drifting</span>
      </div>
      {/* §9 DOM safety net — spatial relations as text (sr-only; visible if WebGL unavailable) */}
      <div className="recon-spatial-sr" aria-label="reconstruction layout description">
        <p>Spatial reconstruction of Chris, framed by the room. The lamp marks the center; its light reads {room?.tone ?? "settled"}.</p>
        <ul>
          {(room?.anchors ?? []).map((a) => (
            <li key={a.id}>{a.label}</li>
          ))}
        </ul>
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
          {onChallengeClaim && (
            <button
              type="button"
              className="board-challenge recon-detail-challenge"
              onClick={() => onChallengeClaim(selected.id)}
            >
              challenge this fragment
            </button>
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
