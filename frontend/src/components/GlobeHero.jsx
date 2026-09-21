import { forwardRef, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { cn } from '@/lib/utils';

// Globo wireframe rotando lento - adaptado del componente "DotGlobeHero"
// (marketing/hero2.txt) para representar la red distribuida de cargadores
// EV que BILON coordina, en vez de una red generica.
function Globe({ rotationSpeed, radius, color }) {
  const groupRef = useRef(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += rotationSpeed;
      groupRef.current.rotation.x += rotationSpeed * 0.3;
      groupRef.current.rotation.z += rotationSpeed * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[radius, 48, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} wireframe />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius * 0.62, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} wireframe />
      </mesh>
    </group>
  );
}

// Auto EV low-poly armado con primitivas (caja carroceria + caja cabina +
// 4 ruedas cilindricas), todo wireframe. Gira principalmente en Y como en
// una tarima de auto show - no tumba en los 3 ejes como el globo, porque
// una forma asimetrica tumbando se ve raro (el globo es simetrico, esto no).
function CarWireframe({ rotationSpeed, radius, color }) {
  const groupRef = useRef(null);
  const wobbleRef = useRef(0);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += rotationSpeed * 1.4;
      wobbleRef.current += rotationSpeed;
      groupRef.current.rotation.x = Math.sin(wobbleRef.current * 0.6) * 0.06;
    }
  });

  const s = radius; // escala general para que reaccione igual que "globeRadius"
  const wheelZ = 0.5 * s;
  const wheelX = 0.72 * s;

  return (
    <group ref={groupRef}>
      {/* carroceria */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[2.2 * s, 0.5 * s, 0.95 * s]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} wireframe />
      </mesh>
      {/* cabina */}
      <mesh position={[-0.15 * s, 0.5 * s, 0]}>
        <boxGeometry args={[1.05 * s, 0.42 * s, 0.82 * s]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} wireframe />
      </mesh>
      {/* ruedas */}
      {[
        [wheelX, -wheelZ], [wheelX, wheelZ], [-wheelX, -wheelZ], [-wheelX, wheelZ],
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, -0.22 * s, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.3 * s, 0.3 * s, 0.18 * s, 20]} />
          <meshBasicMaterial color={color} transparent opacity={0.35} wireframe />
        </mesh>
      ))}
    </group>
  );
}

// Rayo armado con 2 vigas (boxGeometry) inclinadas en espejo, igual patron
// robusto que el auto (primitivas simples, sin Shape/ExtrudeGeometry - esa
// version producia triangulos gigantes por como earcut triangulaba el
// contorno). Las 2 vigas se cruzan cerca del centro formando el zigzag tipo
// "flash". Gira sobre Z (queda de frente a camara) con leve balanceo en Y.
function BoltWireframe({ rotationSpeed, radius, color }) {
  const groupRef = useRef(null);
  const tRef = useRef(0);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.z += rotationSpeed * 2.2;
      tRef.current += rotationSpeed;
      groupRef.current.rotation.y = Math.sin(tRef.current * 0.7) * 0.55;
    }
  });

  const s = radius;

  return (
    <group ref={groupRef} scale={s}>
      <mesh position={[0.16, 0.42, 0]} rotation={[0, 0, 0.55]}>
        <boxGeometry args={[0.34, 1.0, 0.22]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} wireframe />
      </mesh>
      <mesh position={[-0.16, -0.42, 0]} rotation={[0, 0, -0.55]}>
        <boxGeometry args={[0.34, 1.0, 0.22]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} wireframe />
      </mesh>
    </group>
  );
}

const ORBIT_ANGLES = [0, Math.PI / 3, (2 * Math.PI) / 3];

// Un electron viaja en circulo dentro del espacio LOCAL de su orbita (sin
// achatar) - el padre (OrbitRing) le aplica scale.y=0.4 + la rotacion en Z,
// asi que el circulo automaticamente sale elipse e inclinado igual que el
// anillo, sin tener que calcular la elipse a mano.
function Electron({ radiusOrbit, speed, color }) {
  const ref = useRef(null);
  const angleRef = useRef(Math.random() * Math.PI * 2);

  useFrame(() => {
    angleRef.current += speed;
    if (ref.current) {
      ref.current.position.set(
        radiusOrbit * Math.cos(angleRef.current),
        radiusOrbit * Math.sin(angleRef.current),
        0,
      );
    }
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.06, 12, 12]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function OrbitRing({
  angleOffset, radiusOrbit, speed, color,
}) {
  return (
    <group rotation={[0, 0, angleOffset]} scale={[1, 0.4, 1]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radiusOrbit, 0.012, 8, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} wireframe />
      </mesh>
      <Electron radiusOrbit={radiusOrbit} speed={speed} color={color} />
    </group>
  );
}

// Atomo estilo "logo de quimica": nucleo + 3 orbitas elipticas a 60 grados
// entre si (mismo esquema que el logo de React), cada una con un electron
// (esfera solida) recorriendola a velocidad distinta. El grupo entero tumba
// lento en 3 ejes como el globo - el atomo tiene suficiente simetria (3
// orbitas repartidas) para que tumbar se vea bien, a diferencia del auto.
function AtomWireframe({ rotationSpeed, radius, color }) {
  const groupRef = useRef(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += rotationSpeed;
      groupRef.current.rotation.x += rotationSpeed * 0.35;
    }
  });

  const s = radius;

  return (
    <group ref={groupRef} scale={s}>
      <mesh>
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} wireframe />
      </mesh>
      {ORBIT_ANGLES.map((angle, i) => (
        <OrbitRing
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          angleOffset={angle}
          radiusOrbit={0.85}
          speed={0.018 + i * 0.006}
          color={color}
        />
      ))}
    </group>
  );
}

const GlobeHero = forwardRef(({
  rotationSpeed = 0.004, globeRadius = 1, color = '#38bdf8', shape = 'globe', className, children, ...props
}, ref) => (
  <div ref={ref} className={cn('relative h-screen w-full overflow-hidden bg-background', className)} {...props}>
    <div className="relative z-10 flex h-full flex-col items-center justify-center">
      {children}
    </div>
    <div className="pointer-events-none absolute inset-0 z-0">
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 3]} fov={75} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        {shape === 'car' && <CarWireframe rotationSpeed={rotationSpeed} radius={globeRadius} color={color} />}
        {shape === 'bolt' && <BoltWireframe rotationSpeed={rotationSpeed} radius={globeRadius} color={color} />}
        {shape === 'atom' && <AtomWireframe rotationSpeed={rotationSpeed} radius={globeRadius} color={color} />}
        {shape === 'globe' && <Globe rotationSpeed={rotationSpeed} radius={globeRadius} color={color} />}
      </Canvas>
    </div>
  </div>
));
GlobeHero.displayName = 'GlobeHero';

export default GlobeHero;
