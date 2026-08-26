"use client";

import { useRef } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { RoomState } from "../lib/reconstruction/room";

/**
 * M3 — RoomEnvironment (R3F v9).
 *
 * Procedural placeholder for "the room" (D12). Asset-agnostic: the hero meshes
 * are an external asset-production dependency (D9), so until those exist this
 * draws a deterministic placeholder whose geometry is positioned entirely by the
 * pure `buildRoomState` adapter. Swapping in authored GLTF later is a drop-in:
 * replace the placeholder meshes, keep the same positions.
 *
 * The room is the *frame*; the reconstruction fragments (drawn by
 * ReconstructionScene) live inside it. This component owns the floor, the place
 * anchors (lamp/window/door/chair), and the lamp whose tint carries the room's
 * tone — never asserting world-truth, only presentation.
 *
 * IMPORTANT: every decorative mesh here uses `raycast={() => null}` so it is
 * transparent to pointer raycasts. The room is a frame and must never intercept
 * the player's clicks on reconstruction fragments (which sit near the lamp at the
 * scene's focal point). Without this, the "the lamp" floor-label at (0,0,0)
 * steals the center raycast and breaks fragment selection.
 *
 * Reduced-motion (§9 floor): when the user prefers reduced motion, the lamp's
 * subtle flicker/breath is suppressed — the scene stays static.
 */

const TONE_LAMP: Record<RoomState["tone"], string> = {
  settled: "#e3b863",
  tense: "#c69a4c",
  fragmented: "#b98a3a",
};

// Decorative meshes are never click targets.
const noRaycast = () => null;

export default function RoomEnvironment({
  room,
  reducedMotion,
}: {
  room: RoomState;
  reducedMotion: boolean;
}) {
  const lampRef = useRef<any>(null);
  const lampColor = TONE_LAMP[room.tone];

  useFrame((state) => {
    if (reducedMotion || !lampRef.current) return;
    // Gentle breath of the lamp — presentation only, suppressed on reduced motion.
    const t = state.clock.elapsedTime;
    const flick = 1 + Math.sin(t * 0.8) * 0.06;
    lampRef.current.intensity = 1.1 * flick;
  });

  return (
    <group>
      {/* floor — the room's base plane (decorative, non-interactive) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.25, 0]}
        receiveShadow
        raycast={noRaycast}
      >
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color="#191712" roughness={1} metalness={0} />
      </mesh>

      {/* lamp at the room's center — tinted by tone (presentation) */}
      <pointLight ref={lampRef} position={[0, 0.9, 0]} intensity={1.1} color={lampColor} distance={5} />
      <mesh position={[0, 1.0, 0]} raycast={noRaycast}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color={lampColor} />
      </mesh>

      {/* place anchors — floating labels only (non-interactive, so they never
          intercept clicks meant for reconstruction fragments). */}
      {room.anchors.map((a) => (
        <Text
          key={a.id}
          position={[a.position.x, 0.0, a.position.z]}
          fontSize={0.08}
          color="#8a7c5e"
          anchorX="center"
          anchorY="middle"
          raycast={noRaycast}
        >
          {a.label}
        </Text>
      ))}
    </group>
  );
}

// Keep ThreeElements referenced for typing parity (avoids unused-import lint churn).
export type _ThreeElements = ThreeElements;
