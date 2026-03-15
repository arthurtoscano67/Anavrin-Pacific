import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Sparkles } from '@react-three/drei';
import { BackSide, Group, MathUtils, Mesh, Vector3 } from 'three';

import { monsterTraits3D, resolveMonster3D, type MonsterSeedSource, type ResolvedMonster3D } from './monster3d';

type MonsterPose = 'idle' | 'attack' | 'recoil' | 'victory';

function StageFloor({ color = '#1f1a39', ring = '#6ae4ff' }: { color?: string; ring?: string }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.4, 0]} receiveShadow>
        <circleGeometry args={[4.5, 56]} />
        <meshStandardMaterial color={color} roughness={0.92} metalness={0.08} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.39, 0]}>
        <ringGeometry args={[2.35, 3.25, 64]} />
        <meshBasicMaterial color={ring} transparent opacity={0.26} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.38, 0]}>
        <ringGeometry args={[0.85, 1.45, 64]} />
        <meshBasicMaterial color="#ffd56a" transparent opacity={0.18} />
      </mesh>
    </group>
  );
}

function ArenaShell() {
  return (
    <group>
      <mesh position={[0, 1.2, -3.6]}>
        <cylinderGeometry args={[5.6, 6.4, 2.8, 32, 1, true]} />
        <meshStandardMaterial color="#24183d" metalness={0.12} roughness={0.88} side={BackSide} />
      </mesh>
      <mesh position={[0, 3.2, -3.2]}>
        <torusGeometry args={[4.2, 0.1, 18, 80]} />
        <meshStandardMaterial emissive="#3cc8ff" emissiveIntensity={1.2} color="#1d1838" />
      </mesh>
      <mesh position={[0, 2.8, -2.9]}>
        <torusGeometry args={[3.6, 0.08, 18, 80]} />
        <meshStandardMaterial emissive="#f38dff" emissiveIntensity={0.9} color="#231a3c" />
      </mesh>
      <Sparkles count={24} scale={[8, 4.5, 6]} size={2.2} speed={0.25} opacity={0.28} color="#7be7ff" />
    </group>
  );
}

function BlobShadow({ x = 0, z = 0, scale = 1 }: { x?: number; z?: number; scale?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, -1.31, z]}>
      <circleGeometry args={[0.72 * scale, 32]} />
      <meshBasicMaterial color="#04060f" transparent opacity={0.28} />
    </mesh>
  );
}

function EggShell({ monster }: { monster: ResolvedMonster3D }) {
  const traits = monsterTraits3D(monster);
  return (
    <group>
      <mesh castShadow position={[0, -0.15, 0]} scale={[0.95, 1.18, 0.95]}>
        <sphereGeometry args={[0.62, 22, 22]} />
        <meshStandardMaterial color={traits.palette.belly} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.06, 0.34]}>
        <boxGeometry args={[0.14, 0.02, 0.02]} />
        <meshBasicMaterial color={traits.palette.outline} />
      </mesh>
      <mesh position={[-0.14, -0.02, 0.34]} rotation={[0, 0, -0.6]}>
        <boxGeometry args={[0.18, 0.02, 0.02]} />
        <meshBasicMaterial color={traits.palette.outline} />
      </mesh>
      <mesh position={[0.18, -0.08, 0.34]} rotation={[0, 0, 0.55]}>
        <boxGeometry args={[0.16, 0.02, 0.02]} />
        <meshBasicMaterial color={traits.palette.outline} />
      </mesh>
      <mesh position={[-traits.eyeSpacing * 0.62, -0.05, 0.58]}>
        <sphereGeometry args={[0.08, 18, 18]} />
        <meshStandardMaterial color={traits.palette.eyeWhite} emissive={traits.palette.eyeWhite} emissiveIntensity={0.1} />
      </mesh>
      <mesh position={[traits.eyeSpacing * 0.62, -0.05, 0.58]}>
        <sphereGeometry args={[0.08, 18, 18]} />
        <meshStandardMaterial color={traits.palette.eyeWhite} emissive={traits.palette.eyeWhite} emissiveIntensity={0.1} />
      </mesh>
      <mesh position={[-traits.eyeSpacing * 0.62, -0.05, 0.65]}>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshStandardMaterial color={traits.palette.iris} />
      </mesh>
      <mesh position={[traits.eyeSpacing * 0.62, -0.05, 0.65]}>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshStandardMaterial color={traits.palette.iris} />
      </mesh>
    </group>
  );
}

function Eyes({ traits }: { traits: ReturnType<typeof monsterTraits3D> }) {
  const blinkRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!blinkRef.current) return;
    const t = clock.elapsedTime;
    const beat = Math.sin(t * 0.9) * 0.5 + 0.5;
    const blink = beat > 0.985 ? 0.18 : 1;
    blinkRef.current.scale.y = MathUtils.damp(blinkRef.current.scale.y, blink, 14, 1 / 60);
  });

  const eyeScale = traits.eyeShape === 0 ? [0.18, 0.22, 0.08] : traits.eyeShape === 1 ? [0.2, 0.18, 0.08] : [0.16, 0.25, 0.08];
  const irisScale = traits.eyeShape === 2 ? [0.07, 0.11, 0.04] : [0.08, 0.09, 0.04];

  return (
    <group ref={blinkRef} position={[0, 0.2, 0.52]}>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * traits.eyeSpacing, 0, 0]}>
          <mesh castShadow scale={eyeScale as [number, number, number]}>
            <sphereGeometry args={[1, 18, 18]} />
            <meshStandardMaterial color={traits.palette.eyeWhite} emissive={traits.palette.eyeWhite} emissiveIntensity={0.12} />
          </mesh>
          <mesh position={[0, -0.01, 0.08]} scale={irisScale as [number, number, number]}>
            <sphereGeometry args={[1, 18, 18]} />
            <meshStandardMaterial color={traits.palette.iris} emissive={traits.palette.iris} emissiveIntensity={0.16} />
          </mesh>
          <mesh position={[0.02, 0.05, 0.12]} scale={[0.025, 0.025, 0.02]}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.35} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Ears({ traits }: { traits: ReturnType<typeof monsterTraits3D> }) {
  return (
    <group position={[0, 0.98, 0]}>
      {[-1, 1].map((side) => {
        const x = 0.38 * side;
        if (traits.earType === 0) {
          return (
            <mesh key={side} position={[x, 0.2, 0]} rotation={[0.1, 0, -0.18 * side]} castShadow>
              <coneGeometry args={[0.16, 0.44, 5]} />
              <meshStandardMaterial color={traits.palette.bodyLight} />
            </mesh>
          );
        }
        if (traits.earType === 1) {
          return (
            <mesh key={side} position={[x, 0.14, 0]} rotation={[0, 0, -0.48 * side]} castShadow>
              <capsuleGeometry args={[0.09, 0.26, 4, 10]} />
              <meshStandardMaterial color={traits.palette.bodyLight} />
            </mesh>
          );
        }
        return (
          <mesh key={side} position={[x, 0.1, 0.04]} rotation={[0.25, 0, -0.3 * side]} castShadow>
            <sphereGeometry args={[0.15, 18, 18]} />
            <meshStandardMaterial color={traits.palette.bodyLight} />
          </mesh>
        );
      })}
    </group>
  );
}

function Horns({ traits, monster }: { traits: ReturnType<typeof monsterTraits3D>; monster: ResolvedMonster3D }) {
  if (!traits.hasHorns) return null;
  return (
    <group position={[0, 1.05, -0.02]}>
      {[-1, 1].map((side) => {
        const broken = side === 1 && monster.broken_horns > 0;
        const height = broken ? 0.18 : traits.hornType === 2 ? 0.34 : 0.26;
        return (
          <mesh key={side} position={[side * 0.22, 0.16, 0]} rotation={[0, 0, -0.32 * side]} castShadow>
            <coneGeometry args={[traits.hornType === 1 ? 0.08 : 0.06, height, 5]} />
            <meshStandardMaterial color={traits.palette.accent} />
          </mesh>
        );
      })}
    </group>
  );
}

function Limbs({ traits }: { traits: ReturnType<typeof monsterTraits3D> }) {
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={`arm-${side}`} position={[side * 0.46, 0.2, 0]} rotation={[0, 0, -0.2 * side]}>
          <mesh castShadow>
            <capsuleGeometry args={[0.08, traits.armLength, 4, 10]} />
            <meshStandardMaterial color={traits.palette.bodyLight} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group key={`leg-${side}`} position={[side * 0.2, -0.84, 0]}>
          <mesh castShadow>
            <capsuleGeometry args={[0.09, traits.legLength, 4, 10]} />
            <meshStandardMaterial color={traits.palette.bodyLight} />
          </mesh>
          <mesh position={[0, -0.28, 0.05]} castShadow>
            <sphereGeometry args={[0.09, 14, 14]} />
            <meshStandardMaterial color={traits.gear.shoes ? traits.palette.accent : traits.palette.bodyDark} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Tail({ traits }: { traits: ReturnType<typeof monsterTraits3D> }) {
  if (!traits.hasTail) return null;
  const rotation = traits.tailType === 2 ? 0.8 : 0.45;
  return (
    <group position={[0, -0.3, -0.42]} rotation={[0.2, 0, -rotation]}>
      <mesh castShadow>
        <capsuleGeometry args={[0.06, 0.6, 4, 10]} />
        <meshStandardMaterial color={traits.palette.bodyLight} />
      </mesh>
      <mesh position={[0.04, 0.38, 0]} castShadow>
        <sphereGeometry args={[traits.tailType === 1 ? 0.11 : 0.08, 14, 14]} />
        <meshStandardMaterial color={traits.palette.accent} emissive={traits.palette.accent} emissiveIntensity={0.14} />
      </mesh>
    </group>
  );
}

function Wings({ traits, monster }: { traits: ReturnType<typeof monsterTraits3D>; monster: ResolvedMonster3D }) {
  if (!traits.hasWings) return null;
  const torn = monster.torn_wings > 0;
  const wingScale: [number, number, number] =
    traits.wingType === 2 ? [0.64, 1.05, 0.16] : traits.wingType === 1 ? [0.58, 0.86, 0.14] : [0.52, 0.74, 0.12];
  return (
    <group position={[0, 0.12, -0.32]}>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.5, 0.16, -0.08]}
          rotation={[0.22, 0.12 * side, -0.48 * side]}
          scale={side === 1 && torn ? [wingScale[0], wingScale[1] * 0.82, wingScale[2]] : wingScale}
          castShadow
        >
          <tetrahedronGeometry args={[0.66, 0]} />
          <meshStandardMaterial color={traits.palette.accent} emissive={traits.palette.aura} emissiveIntensity={0.18} transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Gear({ traits }: { traits: ReturnType<typeof monsterTraits3D> }) {
  return (
    <group>
      {traits.gear.hat ? (
        <group position={[0, 1.18, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.26, 0.32, 0.12, 18]} />
            <meshStandardMaterial color={traits.palette.accent} />
          </mesh>
          <mesh position={[0, -0.08, 0]} castShadow>
            <cylinderGeometry args={[0.42, 0.42, 0.03, 18]} />
            <meshStandardMaterial color={traits.palette.bodyDark} />
          </mesh>
        </group>
      ) : null}
      {traits.gear.armor ? (
        <mesh position={[0, -0.08, 0.24]} castShadow>
          <boxGeometry args={[0.72, 0.74, 0.12]} />
          <meshStandardMaterial color={traits.palette.accent} metalness={0.3} roughness={0.55} />
        </mesh>
      ) : null}
      {traits.gear.suit ? (
        <mesh position={[0, -0.22, -0.34]} rotation={[0.12, 0, 0]} castShadow>
          <boxGeometry args={[0.8, 0.92, 0.02]} />
          <meshStandardMaterial color={traits.palette.bodyDark} transparent opacity={0.82} />
        </mesh>
      ) : null}
    </group>
  );
}

function Scars({ monster }: { monster: ResolvedMonster3D }) {
  const marks = Math.min(monster.scars, 3);
  return (
    <group>
      {Array.from({ length: marks }).map((_, index) => (
        <mesh key={index} position={[-0.18 + index * 0.14, 0.12 - index * 0.1, 0.58]} rotation={[0, 0, -0.35 + index * 0.2]}>
          <boxGeometry args={[0.12, 0.02, 0.02]} />
          <meshBasicMaterial color="#8f204a" />
        </mesh>
      ))}
    </group>
  );
}

function CartoonMonster({ monster, pose = 'idle', facing = 'right', emphasis = false }: { monster: ResolvedMonster3D; pose?: MonsterPose; facing?: 'left' | 'right'; emphasis?: boolean }) {
  const groupRef = useRef<Group>(null);
  const auraRef = useRef<Group>(null);
  const traits = useMemo(() => monsterTraits3D(monster), [monster]);
  const facingDir = facing === 'right' ? 1 : -1;
  const lookTarget = useMemo(() => new Vector3(), []);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    const bounce = Math.sin(t * 1.8 + facingDir) * 0.04;
    const breathe = Math.sin(t * 1.4 + facingDir) * 0.03;

    let targetX = 0;
    let targetRotZ = 0;
    let targetY = bounce;
    let targetScale = 1;

    if (pose === 'attack') {
      targetX = 0.34 * facingDir;
      targetRotZ = -0.15 * facingDir;
      targetY = bounce + 0.05;
    } else if (pose === 'recoil') {
      targetX = -0.18 * facingDir;
      targetRotZ = 0.12 * facingDir;
    } else if (pose === 'victory') {
      targetY = 0.08 + Math.abs(Math.sin(t * 4)) * 0.12;
      targetScale = 1.05;
      targetRotZ = Math.sin(t * 6) * 0.06 * facingDir;
    }

    groupRef.current.position.x = MathUtils.damp(groupRef.current.position.x, targetX, 6, delta);
    groupRef.current.position.y = MathUtils.damp(groupRef.current.position.y, targetY, 6, delta);
    groupRef.current.rotation.z = MathUtils.damp(groupRef.current.rotation.z, targetRotZ, 7, delta);
    groupRef.current.scale.setScalar(MathUtils.damp(groupRef.current.scale.x, targetScale, 6, delta));

    lookTarget.set(0, breathe, 0);
    groupRef.current.position.y += lookTarget.y;

    if (auraRef.current) {
      auraRef.current.rotation.y += delta * 0.35;
      auraRef.current.rotation.z += delta * 0.18;
    }
  });

  if (monster.stage === 0) {
    return (
      <group ref={groupRef} scale={[traits.bodyHeight, traits.bodyHeight, traits.bodyHeight]}>
        <EggShell monster={monster} />
      </group>
    );
  }

  return (
    <group ref={groupRef} scale={[traits.bodyHeight, traits.bodyHeight, traits.bodyHeight]}>
      {traits.hasAura ? (
        <group ref={auraRef}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.1, -0.18]}>
            <torusGeometry args={[1.05, 0.05, 14, 40]} />
            <meshBasicMaterial color={traits.palette.aura} transparent opacity={0.3} />
          </mesh>
          <mesh rotation={[0, 0, 0]} position={[0, 0.3, 0]}>
            <icosahedronGeometry args={[1.18, 0]} />
            <meshBasicMaterial color={traits.palette.aura} transparent opacity={0.06} wireframe />
          </mesh>
          <Sparkles count={18} scale={[2.4, 2.2, 2.4]} size={2.4} speed={0.4} opacity={0.5} color={traits.palette.aura} />
        </group>
      ) : null}

      <Wings traits={traits} monster={monster} />
      <Tail traits={traits} />

      <group>
        <mesh castShadow position={[0, -0.08, 0]} scale={traits.bodyScale}>
          <capsuleGeometry args={[0.5, 0.95, 6, 14]} />
          <meshStandardMaterial color={traits.palette.body} roughness={0.82} metalness={0.05} />
        </mesh>
        <mesh castShadow position={[0, -0.12, 0.42]} scale={[0.34, 0.44, 0.16]}>
          <sphereGeometry args={[1, 18, 18]} />
          <meshStandardMaterial color={traits.palette.belly} />
        </mesh>
      </group>

      <Limbs traits={traits} />
      <Gear traits={traits} />

      <group position={[0, 0.54, 0.08]}>
        <mesh castShadow scale={traits.headScale}>
          <sphereGeometry args={[0.58, 24, 24]} />
          <meshStandardMaterial color={traits.palette.bodyLight} roughness={0.78} metalness={0.04} />
        </mesh>
        <mesh position={[0, 0.02, 0.38]} castShadow scale={[0.16, 0.1, 0.1]}>
          <sphereGeometry args={[1, 18, 18]} />
          <meshStandardMaterial color={traits.palette.bodyDark} />
        </mesh>
        <Ears traits={traits} />
        <Horns traits={traits} monster={monster} />
        <Eyes traits={traits} />
        <Scars monster={monster} />
      </group>

      {emphasis ? <Sparkles count={8} scale={[1.4, 1.3, 1.4]} size={1.6} speed={0.45} opacity={0.45} color={traits.palette.accent} /> : null}
    </group>
  );
}

function ArenaLights() {
  return (
    <>
      <color attach="background" args={['#09050f']} />
      <fog attach="fog" args={['#09050f', 7, 14]} />
      <hemisphereLight args={['#95d7ff', '#0f071b', 1.05]} />
      <directionalLight castShadow intensity={1.55} position={[3.6, 5.2, 3.4]} color="#f4fbff" shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight intensity={18} color="#8b5cf6" position={[-2.8, 2.6, 2.4]} distance={10} />
      <pointLight intensity={12} color="#22d3ee" position={[2.6, 2.2, 2.4]} distance={9} />
      <pointLight intensity={5} color="#f59e0b" position={[0, 1, 1.4]} distance={6} />
    </>
  );
}

function BattleArenaScene({
  leftMonster,
  rightMonster,
  leftPose,
  rightPose,
  winnerSide,
}: {
  leftMonster: ResolvedMonster3D | null;
  rightMonster: ResolvedMonster3D | null;
  leftPose: MonsterPose;
  rightPose: MonsterPose;
  winnerSide?: 'left' | 'right';
}) {
  return (
    <>
      <ArenaLights />
      <ArenaShell />
      <StageFloor />
      <ContactShadows position={[0, -1.3, 0]} opacity={0.42} width={8} height={4} blur={2.4} far={4.4} />
      <BlobShadow x={-1.5} scale={1.12} />
      <BlobShadow x={1.5} scale={1.12} />
      {leftMonster ? <group position={[-1.5, -0.22, 0.2]}><CartoonMonster monster={leftMonster} pose={leftPose} facing="right" emphasis={winnerSide === 'left'} /></group> : null}
      {rightMonster ? <group position={[1.5, -0.22, -0.15]}><CartoonMonster monster={rightMonster} pose={rightPose} facing="left" emphasis={winnerSide === 'right'} /></group> : null}
    </>
  );
}

function PortraitScene({ monster, mirrored = false }: { monster: ResolvedMonster3D; mirrored?: boolean }) {
  const traits = monsterTraits3D(monster);
  return (
    <>
      <ArenaLights />
      <StageFloor color={traits.palette.floor} ring={traits.palette.aura} />
      <ContactShadows position={[0, -1.3, 0]} opacity={0.4} width={4.4} height={3.4} blur={2.2} far={3} />
      <BlobShadow scale={0.92} />
      <group position={[0, -0.24, 0]} scale={mirrored ? [-1, 1, 1] : [1, 1, 1]}>
        <CartoonMonster monster={monster} facing={mirrored ? 'left' : 'right'} emphasis={monster.stage >= 3} />
      </group>
    </>
  );
}

function CanvasShell({ children, cameraPosition, fov }: { children: React.ReactNode; cameraPosition: [number, number, number]; fov: number }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      shadows
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ position: cameraPosition, fov }}
    >
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
}

export function MonsterPortraitCanvas({ monster, className = '', mirrored = false }: { monster: MonsterSeedSource | null | undefined; className?: string; mirrored?: boolean }) {
  const resolved = useMemo(() => resolveMonster3D(monster), [monster]);
  if (!resolved) return null;

  return (
    <div className={className}>
      <CanvasShell cameraPosition={[0, 0.6, 4.6]} fov={28}>
        <PortraitScene monster={resolved} mirrored={mirrored} />
      </CanvasShell>
    </div>
  );
}

export function BattleArenaCanvas3D({
  leftMonster,
  rightMonster,
  leftPose,
  rightPose,
  winnerSide,
  className = '',
}: {
  leftMonster: MonsterSeedSource | null | undefined;
  rightMonster: MonsterSeedSource | null | undefined;
  leftPose: MonsterPose;
  rightPose: MonsterPose;
  winnerSide?: 'left' | 'right';
  className?: string;
}) {
  const resolvedLeft = useMemo(() => resolveMonster3D(leftMonster), [leftMonster]);
  const resolvedRight = useMemo(() => resolveMonster3D(rightMonster), [rightMonster]);

  return (
    <div className={className}>
      <CanvasShell cameraPosition={[0, 1.1, 7.6]} fov={32}>
        <BattleArenaScene
          leftMonster={resolvedLeft}
          rightMonster={resolvedRight}
          leftPose={leftPose}
          rightPose={rightPose}
          winnerSide={winnerSide}
        />
      </CanvasShell>
    </div>
  );
}
