"use client";

import { useRef } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { RoomState } from "../lib/reconstruction/room";
import { ENVIRONMENTS, type EnvironmentId } from "../lib/reconstruction/environment";

/**
 * M3/D7 — RoomEnvironment (R3F v9).
 *
 * Procedural placeholder for the authored environments (the room / porch / last
 * call, D12/D7). Asset-agnostic: the hero meshes are an external asset-
 * production dependency (D9), so until those exist this draws a deterministic
 * placeholder whose geometry is positioned entirely by the pure adapters.
 * Swapping in authored GLTF later is a drop-in: replace the placeholder meshes,
 * keep the same positions.
 *
 * The environment is a *frame*; the reconstruction fragments (drawn by
 * ReconstructionScene) live inside it. This component owns the floor, the place
 * anchors, and the key light whose tint carries the environment's atmosphere —
 * never asserting world-truth, only presentation.
 *
 * IMPORTANT: every decorative mesh here uses `raycast={() => null}` so it is
 * transparent to pointer raycasts. The environment is a frame and must never
 * intercept the player's clicks on reconstruction fragments (which sit near the
 * focal light at the scene's focal point).
 *
 * Reduced-motion (§9 floor): when the user prefers reduced motion, the light's
 * subtle breath is suppressed — the scene stays static.
 */

const noRaycast = () => null;

export default function RoomEnvironment({
  room,
  reducedMotion,
}: {
  room: RoomState;
  reducedMotion: boolean;
}) {
  const lampRef = useRef<any>(null);
  const envId = (room.id ?? "the_room") as EnvironmentId;
  const def = ENVIRONMENTS[envId];
  const lampColor = def.lightColor;

  useFrame((state) => {
    if (reducedMotion || !lampRef.current) return;
    // Gentle breath of the key light — presentation only, suppressed on reduced motion.
    const t = state.clock.elapsedTime;
    const flick = 1 + Math.sin(t * 0.8) * 0.06;
    lampRef.current.intensity = 1.1 * flick;
  });

  return (
    <group>
      {/* floor — the environment's base plane (decorative, non-interactive) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.25, 0]}
        receiveShadow
        raycast={noRaycast}
      >
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color={def.floorColor} roughness={1} metalness={0} />
      </mesh>

      {/* key light at the environment's focal point — tinted by atmosphere (presentation) */}
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
