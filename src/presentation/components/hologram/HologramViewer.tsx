'use client';

import { useRef, useMemo, Suspense, useEffect, useState, Component, ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Float, useGLTF, Center, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { CampaignTheme } from '@domain/entities/Campaign';
import { useCampaignStore } from '@presentation/stores/campaignStore';


// ─────────────────────────────────────────────────────────────
// Holographic ShaderMaterial factory
// ─────────────────────────────────────────────────────────────
function createHolographicMaterial(color: string, glowIntensity: number) {
  return new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3  uColor;
      uniform float uGlowIntensity;
      varying vec3  vNormal;
      varying vec3  vWorldPosition;
      varying vec2  vUv;

      void main() {
        // Fresnel — glowing edges (more pronounced for visibility)
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float fresnel = 1.0 - clamp(dot(vNormal, viewDir), 0.0, 1.0);
        fresnel = pow(fresnel, 1.5); // smoother power for thicker glowing edges

        // Horizontal scan lines
        float scan = sin(vWorldPosition.y * 35.0 + uTime * 2.5);
        scan = clamp(scan * 0.5 + 0.5, 0.0, 1.0);
        scan = mix(0.65, 1.0, scan); // make minimum scanline visibility 0.65 for less fading

        // Subtle flicker
        float flicker = 1.0 - 0.03 * sin(uTime * 19.3) * sin(uTime * 6.7);

        // UV grid lines
        float gx = abs(sin(vUv.x * 20.0)) * 0.15;
        float gy = abs(sin(vUv.y * 20.0)) * 0.15;
        float grid = max(gx, gy);

        // Compose color
        vec3 col = uColor * uGlowIntensity * scan;
        col += uColor * fresnel * 4.0;   // brighter rim
        col += uColor * grid * 1.5;      // brighter grid overlay

        // Increased base opacity from 0.07 to 0.25, fresnel factor to 1.2
        float alpha = (fresnel * 1.2 + 0.25) * scan * flicker + grid * 0.45;
        alpha = clamp(alpha, 0.0, 1.0);

        gl_FragColor = vec4(col, alpha);
      }
    `,
    uniforms: {
      uTime:          { value: 0 },
      uColor:         { value: new THREE.Color(color) },
      uGlowIntensity: { value: glowIntensity },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ─────────────────────────────────────────────────────────────
// Apply holographic material to every mesh in a GLTF scene
// ─────────────────────────────────────────────────────────────
function applyHolographicToScene(
  scene: THREE.Group,
  mat: THREE.ShaderMaterial,
) {
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.material = mat;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
  });
}

// Helper to modify materials for textured hologram
function modifyMaterialForHologram(
  material: THREE.Material,
  glowColor: string,
  productColor?: string,
  maxAnisotropy?: number,
): THREE.Material {
  const m = material.clone();
  m.transparent = false;
  m.opacity = 1.0;
  m.depthWrite = true;

  // Sharpen texture mapping for decals, text, logos and decals
  if ('map' in m && (m as any).map) {
    const texture = (m as any).map;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    if (maxAnisotropy) {
      texture.anisotropy = maxAnisotropy;
    }
    texture.mipMapBias = -0.8; // Force sharper mipmap selection at all angles
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }

  const materialName = (m.name || '').toLowerCase();
  const hasProductColor = !!productColor && productColor !== '';

  // Check if this material corresponds to the body paint / primary color of the product (car, shoe, etc.)
  if (
    hasProductColor &&
    (materialName.includes('body') ||
      materialName.includes('paint') ||
      materialName.includes('red') || // Three.js Ferrari uses 'Red' or 'body' materials
      materialName.includes('car_paint') ||
      materialName.includes('exterior') ||
      materialName.includes('color_') ||
      materialName.includes('base') ||
      // Default: if it's a solid colored material that is reddish/base-ish, we override it
      ('color' in m && (m as any).color.r > 0.6 && (m as any).color.g < 0.25 && (m as any).color.b < 0.25))
  ) {
    if ('color' in m) {
      const targetMat = m.clone() as any;
      targetMat.color.copy(new THREE.Color(productColor));
      
      // Make it glossy car paint
      if ('roughness' in targetMat) targetMat.roughness = 0.15;
      if ('metalness' in targetMat) targetMat.metalness = 0.85;
      
      // Add subtle theme glow overlay
      if ('emissive' in targetMat) {
        targetMat.emissive = new THREE.Color(glowColor);
        targetMat.emissiveIntensity = 0.12; // subtle glowing highlight
      }
      targetMat.transparent = false;
      targetMat.opacity = 1.0;
      return targetMat;
    }
  }

  // Generic material modification (rims, tires, glass, etc.) - add simple neon glow
  if ('emissive' in m) {
    const targetMat = m.clone() as any;
    targetMat.emissive = new THREE.Color(glowColor);
    targetMat.emissiveIntensity = 0.2;
    targetMat.transparent = false;
    targetMat.opacity = 1.0;
    return targetMat;
  }
  return m;
}

// ─────────────────────────────────────────────────────────────
// Error Boundary to catch 3D model loading errors (like 404 / CORS)
// and fallback gracefully to 2.5D image projection
// ─────────────────────────────────────────────────────────────
class ModelErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.error("3D Model load failed, falling back to 2.5D projection:", error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────
// 3D Model loaded from GLB with holographic/rendering styles applied
// ─────────────────────────────────────────────────────────────
function HologramModel({
  url,
  theme,
  rotationSpeed,
  glowIntensity,
  hologramMode = 'textured',
  productColor,
  hideDecorations = false,
}: {
  url: string;
  theme: CampaignTheme;
  rotationSpeed: number;
  glowIntensity: number;
  hologramMode?: 'textured' | 'neon' | 'wireframe';
  productColor?: string;
  hideDecorations?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef   = useRef<THREE.ShaderMaterial | null>(null);
  const { scene } = useGLTF(url);
  const { gl } = useThree();

  // Re-clone the scene when materials need to be rebuilt to avoid mutating cached meshes/materials across style changes
  const clonedScene = useMemo(() => {
    return scene.clone(true);
  }, [scene, hologramMode, theme.glowColor, theme.primaryColor, productColor]);

  // Build and apply materials depending on hologramMode
  useEffect(() => {
    const createdMaterials: THREE.Material[] = [];
    const maxAnisotropy = gl.capabilities.getMaxAnisotropy() || 1;

    if (hologramMode === 'neon') {
      const mat = createHolographicMaterial(theme.glowColor, glowIntensity);
      matRef.current = mat;
      applyHolographicToScene(clonedScene, mat);
      return () => mat.dispose();
    } else if (hologramMode === 'wireframe') {
      clonedScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const mat = new THREE.MeshBasicMaterial({
            color: theme.primaryColor,
            wireframe: true,
            transparent: true,
            opacity: 0.75, // Increased from 0.35 to 0.75 for visual clarity
          });
          createdMaterials.push(mat);
          mesh.material = mat;
        }
      });
    } else {
      // 'textured' mode: keep original materials but make them translucent, emissive, and apply product color
      clonedScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const originalMat = mesh.material;
          
          if (Array.isArray(originalMat)) {
            const mats = originalMat.map(m => {
              const modified = modifyMaterialForHologram(m, theme.glowColor, productColor, maxAnisotropy);
              createdMaterials.push(modified);
              return modified;
            });
            mesh.material = mats;
          } else {
            const modified = modifyMaterialForHologram(originalMat, theme.glowColor, productColor, maxAnisotropy);
            createdMaterials.push(modified);
            mesh.material = modified;
          }
        }
      });
    }

    return () => {
      createdMaterials.forEach((m) => m.dispose());
    };
  }, [clonedScene, theme.glowColor, glowIntensity, hologramMode, theme.primaryColor, productColor]);

  // Animate time uniform + rotation
  useFrame(({ clock }, delta) => {
    if (matRef.current && hologramMode === 'neon') {
      matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
    if (groupRef.current) {
      if ((window as any).__hologramIsRecording) {
        const t = (window as any).__hologramRecordingTime || 0;
        groupRef.current.rotation.y = (t / 4) * Math.PI * 2;
      } else {
        groupRef.current.rotation.y += delta * rotationSpeed * 0.4;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Auto-center and scale the loaded model */}
      <Center>
        <primitive object={clonedScene} />
        
        {/* Wireframe ghost (outer shell, slightly larger) - render inside Center to align perfectly */}
        {hologramMode !== 'textured' && (
          <WireframeShell scene={clonedScene} color={theme.primaryColor} />
        )}
      </Center>

      {/* Decorative rings */}
      {!hideDecorations && (
        <>
          <mesh position={[0, -0.05, 0]}>
            <ringGeometry args={[1.5, 1.7, 64]} />
            <meshBasicMaterial color={theme.primaryColor} transparent opacity={0.15} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, -0.05, 0]}>
            <ringGeometry args={[1.1, 1.15, 64]} />
            <meshBasicMaterial color={theme.primaryColor} transparent opacity={0.3} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  );
}


// ─────────────────────────────────────────────────────────────
// Emitter cone projecting light from floor to hologram
// ─────────────────────────────────────────────────────────────
function ProjectionCone({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (ref.current) {
      // Subtle glowing pulse scale
      const s = 1.0 + Math.sin(clock.getElapsedTime() * 3.5) * 0.04;
      ref.current.scale.set(s, 1.0, s);
    }
  });

  return (
    <mesh ref={ref} position={[0, -0.75, 0]}>
      {/* Cylinder open ended: radiusTop=0.15, radiusBottom=0.8, height=1.7 */}
      <cylinderGeometry args={[0.2, 0.9, 1.7, 32, 1, true]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.08}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────
// Client-side Convolution Sharpening Filter (Unsharp Mask)
// ─────────────────────────────────────────────────────────────
function sharpenImageData(ctx: CanvasRenderingContext2D, width: number, height: number) {
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const originalData = new Uint8ClampedArray(data);

    // Sharpening Convolution Kernel:
    // [  0, -1.2,   0  ]
    // [ -1.2,  5.8, -1.2]
    // [  0, -1.2,   0  ]
    const weights = [
       0,   -1.2,    0,
      -1.2,  5.8, -1.2,
       0,   -1.2,    0
    ];
    const side = 3;
    const halfSide = 1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dstOff = (y * width + x) * 4;
        
        // Skip convolution for fully transparent pixels to save computation
        if (originalData[dstOff + 3] < 10) continue;

        let r = 0, g = 0, b = 0;
        for (let cy = 0; cy < side; cy++) {
          for (let cx = 0; cx < side; cx++) {
            const scy = Math.min(height - 1, Math.max(0, y + cy - halfSide));
            const scx = Math.min(width - 1, Math.max(0, x + cx - halfSide));
            const srcOff = (scy * width + scx) * 4;
            const wt = weights[cy * side + cx];

            r += originalData[srcOff] * wt;
            g += originalData[srcOff + 1] * wt;
            b += originalData[srcOff + 2] * wt;
          }
        }

        // Clamp values 0-255 and write back
        data[dstOff]     = Math.min(255, Math.max(0, r));
        data[dstOff + 1] = Math.min(255, Math.max(0, g));
        data[dstOff + 2] = Math.min(255, Math.max(0, b));
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } catch (err) {
    console.error("Failed to sharpen canvas image data:", err);
  }
}

// ─────────────────────────────────────────────────────────────
// Volumetric 3D Hologram projection from 2D Image using Point Clouds
// ─────────────────────────────────────────────────────────────
function HologramVolumetricParticles({
  url,
  theme,
  rotationSpeed,
  glowIntensity,
  hideDecorations = false,
}: {
  url: string;
  theme: CampaignTheme;
  rotationSpeed: number;
  glowIntensity: number;
  hideDecorations?: boolean;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const [particlesData, setParticlesData] = useState<{
    positions: Float32Array;
    colors: Float32Array;
  } | null>(null);

  useEffect(() => {
    let active = true;
    setParticlesData(null);

    const img = new Image();
    // Only apply crossOrigin to remote external URLs to prevent security/CORS blocks on local base64 and blob images
    if (url.startsWith('http') && !url.startsWith(window.location.origin)) {
      img.crossOrigin = 'Anonymous';
    }
    img.src = url;
    img.onerror = (err) => {
      console.error("Failed to load image in HologramVolumetricParticles:", err);
    };
    img.onload = () => {
      if (!active) return;
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const size = 256; // 256x256 grid for extremely detailed volumetric text and logos
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        // Apply programmatic sharpening convolution filter to make text and details highly defined
        sharpenImageData(ctx, size, size);

        const imageData = ctx.getImageData(0, 0, size, size).data;
        const positions: number[] = [];
        const colors: number[] = [];

        // Check if the source image already has alpha channel transparency (e.g. cutouts)
        // If it does, we don't filter out white or black pixels, preserving full logos and text details!
        let hasTransparency = false;
        for (let i = 3; i < imageData.length; i += 4) {
          if (imageData[i] < 200) {
            hasTransparency = true;
            break;
          }
        }

        const aspect = img.width / img.height || 1.6;
        const widthScale = 2.2;
        const heightScale = widthScale / aspect;
        const maxZ = 0.45; // Depth radius of the volumetric cylindrical body

        const glowCol = new THREE.Color(theme.glowColor);

        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const r = imageData[idx];
            const g = imageData[idx + 1];
            const b = imageData[idx + 2];
            const a = imageData[idx + 3];

            if (a < 50) continue; // transparent pixel

            // If the image doesn't have transparency (like a solid JPEG), filter background
            if (!hasTransparency) {
              const isWhite = r > 230 && g > 230 && b > 230;
              const isBlack = r < 20 && g < 20 && b < 20;
              if (isWhite || isBlack) continue;
            }

            // Map pixel coordinates to 3D positions in R3F space
            const posX = ((x / size) - 0.5) * widthScale;
            const posY = (0.5 - (y / size)) * heightScale;

            // Volumetric Cylindrical Mapping (Z-Displacement)
            const normY = posY / (heightScale / 2); // range [-1, 1]
            const baseZ = Math.sqrt(Math.max(0, 1.0 - normY * normY)) * maxZ;

            // Add surface relief detail based on pixel luminance
            const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
            const detailZ = baseZ * (0.75 + 0.3 * luminance);

            // Add subtle random laser noise
            const scatterZ = (Math.random() - 0.5) * 0.02;

            const finalZFront = detailZ + scatterZ;
            const finalZBack = -detailZ - scatterZ;

            // Normalize and blend original image colors with active theme glow
            const normR = r / 255;
            const normG = g / 255;
            const normB = b / 255;

            // Blend 25% neon theme color into the original pixel colors to give it a hologram tint
            const finalR = THREE.MathUtils.lerp(normR, glowCol.r, 0.25);
            const finalG = THREE.MathUtils.lerp(normG, glowCol.g, 0.25);
            const finalB = THREE.MathUtils.lerp(normB, glowCol.b, 0.25);

            // Front shell particle
            positions.push(posX, posY, finalZFront);
            colors.push(finalR, finalG, finalB);

            // Back shell particle (simulate full 3D body, slightly darker for depth)
            positions.push(posX, posY, finalZBack);
            colors.push(finalR * 0.65, finalG * 0.65, finalB * 0.65);
          }
        }

        setParticlesData({
          positions: new Float32Array(positions),
          colors: new Float32Array(colors),
        });
      } catch (err) {
        console.error("Error generating volumetric particles:", err);
      }
    };

    return () => {
      active = false;
    };
  }, [url, theme.glowColor]);

  useFrame(({ clock }) => {
    if (pointsRef.current) {
      if ((window as any).__hologramIsRecording) {
        const t = (window as any).__hologramRecordingTime || 0;
        pointsRef.current.rotation.y = (t / 4) * Math.PI * 2;
        pointsRef.current.position.y = 0; // lock height wave motion during recording for perfect loop
      } else {
        // Rotate the point cloud
        pointsRef.current.rotation.y = clock.getElapsedTime() * rotationSpeed * 0.45;
        // Floating wave motion
        pointsRef.current.position.y = Math.sin(clock.getElapsedTime() * 1.5) * 0.06;
      }
      
      // Subtle micro-vibrational size pulse (scale down for higher density point grid)
      const material = pointsRef.current.material as THREE.PointsMaterial;
      if (material) {
        material.size = (0.006 + Math.sin(clock.getElapsedTime() * 4.0) * 0.0012) * glowIntensity;
      }
    }
  });

  if (!particlesData) return null;

  return (
    <group>
      {/* Volumetric Point Cloud */}
      <points ref={pointsRef} position={[0, 0.1, 0]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[particlesData.positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[particlesData.colors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.006}
          vertexColors
          transparent
          opacity={0.92}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Futuristic wireframe spinning cage (outer ring structure) */}
      {!hideDecorations && (
        <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
          <mesh>
            <ringGeometry args={[1.35, 1.4, 64]} />
            <meshBasicMaterial color={theme.primaryColor} transparent opacity={0.2} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
// Wireframe shell that wraps the loaded model (ghost effect)
// ─────────────────────────────────────────────────────────────
function WireframeShell({
  scene,
  color,
}: {
  scene: THREE.Group;
  color: string;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Clone the scene graph and replace all materials with a wireframe basic material
  // This automatically inherits the correct positions, rotations, and scales of every part of the car
  const wireframeScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = new THREE.MeshBasicMaterial({
          color: color,
          wireframe: true,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
        });
      }
    });
    return clone;
  }, [scene, color]);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      // Subtle pulsing scale
      const s = 1.02 + Math.sin(clock.getElapsedTime() * 1.5) * 0.005;
      groupRef.current.scale.setScalar(s);
    }
  });

  return <primitive ref={groupRef} object={wireframeScene} />;
}

// ─────────────────────────────────────────────────────────────
// Placeholder shown while model URL is null (before upload)
// ─────────────────────────────────────────────────────────────
function PlaceholderOrb({ theme }: { theme: CampaignTheme }) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef   = useRef<THREE.ShaderMaterial | null>(null);

  useEffect(() => {
    const mat = createHolographicMaterial(theme.primaryColor, 1.6);
    matRef.current = mat;
    return () => mat.dispose();
  }, [theme.primaryColor]);

  useFrame(({ clock }, delta) => {
    if (matRef.current)   matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    if (groupRef.current) {
      if ((window as any).__hologramIsRecording) {
        const t = (window as any).__hologramRecordingTime || 0;
        groupRef.current.rotation.y = (t / 4) * Math.PI * 2;
      } else {
        groupRef.current.rotation.y += delta * 0.35;
      }
    }
  });

  return (
    <Float speed={1.4} rotationIntensity={0.15} floatIntensity={0.4}>
      <group ref={groupRef}>
        {/* Core icosahedron */}
        <mesh>
          <icosahedronGeometry args={[0.85, 2]} />
          {matRef.current && <primitive object={matRef.current} attach="material" />}
        </mesh>
        {/* Wireframe cage */}
        <mesh>
          <icosahedronGeometry args={[0.88, 2]} />
          <meshBasicMaterial color={theme.primaryColor} wireframe transparent opacity={0.35} />
        </mesh>
        {/* Outer sphere */}
        <mesh>
          <sphereGeometry args={[1.3, 32, 32]} />
          <meshBasicMaterial color={theme.secondaryColor} wireframe transparent opacity={0.06} />
        </mesh>
      </group>
    </Float>
  );
}

// ─────────────────────────────────────────────────────────────
// "Generating 3D…" animated indicator inside the canvas
// ─────────────────────────────────────────────────────────────
function GeneratingIndicator({ theme }: { theme: CampaignTheme }) {
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const ring3 = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ring1.current) ring1.current.rotation.z = t * 1.2;
    if (ring2.current) ring2.current.rotation.z = -t * 0.8;
    if (ring3.current) ring3.current.rotation.x = t * 0.6;
  });

  return (
    <group>
      <mesh ref={ring1}>
        <torusGeometry args={[0.6, 0.015, 16, 100]} />
        <meshBasicMaterial color={theme.primaryColor} transparent opacity={0.8} />
      </mesh>
      <mesh ref={ring2} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[0.8, 0.01, 16, 100]} />
        <meshBasicMaterial color={theme.secondaryColor} transparent opacity={0.6} />
      </mesh>
      <mesh ref={ring3} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.0, 0.008, 16, 100]} />
        <meshBasicMaterial color={theme.accentColor} transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
// Floating particle cloud
// ─────────────────────────────────────────────────────────────
function ParticleCloud({ count, color }: { count: number; color: string }) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3]     = (Math.random() - 0.5) * 10;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 10;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    return arr;
  }, [count]);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 0.04;
      ref.current.rotation.x = clock.getElapsedTime() * 0.025;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.02} transparent opacity={0.55} sizeAttenuation />
    </points>
  );
}

// ─────────────────────────────────────────────────────────────
// Perspective grid floor
// ─────────────────────────────────────────────────────────────
function HoloFloor({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const mat = ref.current?.material as THREE.ShaderMaterial | undefined;
    if (mat?.uniforms?.uTime) mat.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.6, 0]}>
      <planeGeometry args={[16, 16]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        uniforms={{ uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } }}
        vertexShader={`
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
        `}
        fragmentShader={`
          uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
          void main() {
            vec2 g = abs(fract(vUv * 12.0 - 0.5) - 0.5) / fwidth(vUv * 12.0);
            float line = min(g.x, g.y);
            float mask = 1.0 - min(line, 1.0);
            float fade = 1.0 - length((vUv - 0.5) * 2.2);
            fade = clamp(pow(fade, 0.5), 0.0, 1.0);
            float pulse = 0.75 + 0.25 * sin(uTime * 0.6);
            gl_FragColor = vec4(uColor, mask * fade * 0.4 * pulse);
          }
        `}
      />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────
// Lights
// ─────────────────────────────────────────────────────────────
function SceneLights({ theme, hologramMode }: { theme: CampaignTheme; hologramMode?: string }) {
  const isTextured = hologramMode === 'textured';
  return (
    <>
      <ambientLight intensity={isTextured ? 0.95 : 0.25} />
      {isTextured ? (
        <>
          <directionalLight position={[6, 8, 6]} intensity={3.5} />
          <directionalLight position={[-6, 4, -6]} intensity={1.8} />
          <directionalLight position={[0, 6, 0]} intensity={1.5} color={theme.accentColor} />
          <pointLight position={[3, -2, 3]} intensity={1.0} color={theme.secondaryColor} />
        </>
      ) : (
        <>
          <pointLight position={[4, 4, 4]}   intensity={4}   color={theme.primaryColor} />
          <pointLight position={[-3, -2, -3]} intensity={2}   color={theme.secondaryColor} />
          <pointLight position={[0, 6, 0]}   intensity={1}   color={theme.accentColor} />
          <spotLight
            position={[0, 8, 0]}
            angle={0.5}
            penumbra={0.9}
            intensity={5}
            color={theme.glowColor}
          />
        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Mock model notice (shown when no FAL_KEY)
// ─────────────────────────────────────────────────────────────
function MockBanner({ isMock, modelUrl }: { isMock: boolean; modelUrl?: string | null }) {
  if (!isMock || !modelUrl) return null;
  const isImageUrl =
    modelUrl.startsWith('data:image/') ||
    modelUrl.startsWith('blob:') ||
    /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(modelUrl);
  if (isImageUrl) return null;
  return (
    <div style={{
      position: 'absolute',
      bottom: '2.5rem',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(123,47,255,0.15)',
      border: '1px solid rgba(123,47,255,0.4)',
      borderRadius: 8,
      padding: '4px 12px',
      fontSize: '0.68rem',
      color: '#a855f7',
      fontFamily: 'var(--font-mono)',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
    }}>
      Demo 3D — Añade FAL_KEY para conversión real de tu imagen
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Smooth Y-axis rotation based on detected face position
// ─────────────────────────────────────────────────────────────
function FaceRotationWrapper({
  facePosition,
  children,
}: {
  facePosition: 'LEFT' | 'CENTER' | 'RIGHT' | 'NONE' | 'OFFLINE';
  children: ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const targetRotationY = useRef(0);
  const currentRotationY = useRef(0);

  useEffect(() => {
    // When the user moves LEFT, rotate the model to the right (positive angle)
    // to reveal the left side of the vehicle.
    // When the user moves RIGHT, rotate to the left (negative angle).
    if (facePosition === 'LEFT') {
      targetRotationY.current = 0.55;
    } else if (facePosition === 'RIGHT') {
      targetRotationY.current = -0.55;
    } else {
      targetRotationY.current = 0;
    }
  }, [facePosition]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      currentRotationY.current = THREE.MathUtils.lerp(
        currentRotationY.current,
        targetRotationY.current,
        delta * 3.5
      );
      groupRef.current.rotation.y = currentRotationY.current;
    }
  });

  return <group ref={groupRef}>{children}</group>;
}

// ─────────────────────────────────────────────────────────────
// Canvas recorder controller
// ─────────────────────────────────────────────────────────────
interface CanvasRecorderControllerProps {
  productName: string;
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;
  recordingFormat: 'webm' | 'mp4';
  setRecordingFormat: (v: 'webm' | 'mp4') => void;
  setHideDecorations: (v: boolean) => void;
  setShowBlackBg: (v: boolean) => void;
}

function CanvasRecorderController({
  productName,
  isRecording,
  setIsRecording,
  recordingFormat,
  setRecordingFormat,
  setHideDecorations,
  setShowBlackBg,
}: CanvasRecorderControllerProps) {
  const { gl } = useThree();
  const recordingStartTime = useRef<number | null>(null);

  useEffect(() => {
    const handleStartExport = (e: any) => {
      if (isRecording) return;

      const format = e.detail.format;
      const pName = e.detail.productName || productName || 'holograma';

      setRecordingFormat(format);
      setIsRecording(true);
      setHideDecorations(true);
      if (format === 'mp4') {
        setShowBlackBg(true);
      } else {
        setShowBlackBg(false);
      }

      // Allow visual changes to apply before starting capture
      setTimeout(() => {
        try {
          (window as any).__hologramIsRecording = true;
          (window as any).__hologramRecordingTime = 0;
          recordingStartTime.current = Date.now();

          // Capture canvas stream at 30 fps
          const stream = gl.domElement.captureStream(30);

          let mimeType = 'video/webm;codecs=vp9';
          let extension = 'webm';

          if (format === 'mp4') {
            if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264')) {
              mimeType = 'video/mp4;codecs=h264';
              extension = 'mp4';
            } else if (MediaRecorder.isTypeSupported('video/mp4')) {
              mimeType = 'video/mp4';
              extension = 'mp4';
            } else {
              mimeType = 'video/webm';
              extension = 'webm';
            }
          } else {
            if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
              mimeType = 'video/webm;codecs=vp9';
            } else {
              mimeType = 'video/webm';
            }
          }

          const chunks: BlobPart[] = [];
          const recorder = new MediaRecorder(stream, { mimeType });

          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) {
              chunks.push(ev.data);
            }
          };

          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const bgSuffix = format === 'mp4' ? 'negro' : 'transparente';
            a.download = `${pName.toLowerCase().replace(/\s+/g, '_')}_holograma_${bgSuffix}.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            (window as any).__hologramIsRecording = false;
            (window as any).__hologramRecordingTime = 0;
            recordingStartTime.current = null;
            setIsRecording(false);
            setHideDecorations(false);
            setShowBlackBg(false);
          };

          recorder.start();

          // Record exactly 4 seconds
          setTimeout(() => {
            if (recorder.state !== 'inactive') {
              recorder.stop();
            }
          }, 4000);

        } catch (err) {
          console.error('Failed to record canvas:', err);
          (window as any).__hologramIsRecording = false;
          (window as any).__hologramRecordingTime = 0;
          recordingStartTime.current = null;
          setIsRecording(false);
          setHideDecorations(false);
          setShowBlackBg(false);
        }
      }, 150);
    };

    window.addEventListener('hologram-export-start' as any, handleStartExport);
    return () => {
      window.removeEventListener('hologram-export-start' as any, handleStartExport);
    };
  }, [gl, isRecording, productName, setIsRecording, setRecordingFormat, setHideDecorations, setShowBlackBg]);

  useFrame(() => {
    if (recordingStartTime.current !== null) {
      const elapsed = Date.now() - recordingStartTime.current;
      const t = Math.min(4000, elapsed) / 1000;
      (window as any).__hologramRecordingTime = t;
    }
  });

  return null;
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────
export interface HologramViewerProps {
  /** URL of the .glb / .gltf 3D model (from fal.ai or mock) */
  modelUrl?: string | null;
  /** Fallback image URL (original product photo) if model fails to load */
  fallbackImageUrl?: string | null;
  /** Whether we're still generating the 3D model */
  isGenerating3D?: boolean;
  /** Whether this model is a mock (shows a banner) */
  isMock?: boolean;
  theme: CampaignTheme;
  rotationSpeed?: number;
  glowIntensity?: number;
  particleCount?: number;
  hologramMode?: 'textured' | 'neon' | 'wireframe';
  productColor?: string;
}

export default function HologramViewer({
  modelUrl,
  fallbackImageUrl,
  isGenerating3D = false,
  isMock = false,
  theme,
  rotationSpeed = 0.5,
  glowIntensity = 1.2,
  particleCount = 150,
  hologramMode = 'textured',
  productColor = '',
}: HologramViewerProps) {
  const [facePosition, setFacePosition] = useState<'LEFT' | 'CENTER' | 'RIGHT' | 'NONE' | 'OFFLINE'>('NONE');
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingFormat, setRecordingFormat] = useState<'webm' | 'mp4'>('webm');
  const [hideDecorations, setHideDecorations] = useState(false);
  const [showBlackBg, setShowBlackBg] = useState(false);

  const productName = useCampaignStore((state) => state.productName) || 'holograma';


  useEffect(() => {
    // 1. Standard web browser postMessage listener (for development and iframe integration)
    const handleBrowserMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'FACE_POSITION') {
        const pos = event.data.position;
        if (['LEFT', 'CENTER', 'RIGHT', 'NONE', 'OFFLINE'].includes(pos)) {
          setFacePosition(pos);
        }
      }
    };
    window.addEventListener('message', handleBrowserMessage);

    // 2. Microsoft WebView2 / Chrome WebView receiver (for production player bridging in DISPL Designer)
    const handleWebViewMessage = (event: any) => {
      const data = event.data;
      if (typeof data === 'string') {
        if (['LEFT', 'CENTER', 'RIGHT', 'NONE', 'OFFLINE'].includes(data)) {
          setFacePosition(data as any);
        }
      } else if (data && data.type === 'FACE_POSITION') {
        setFacePosition(data.position);
      }
    };

    const webviewBridge = (window as any).chrome?.webview;
    if (webviewBridge) {
      webviewBridge.addEventListener('message', handleWebViewMessage);
    }

    return () => {
      window.removeEventListener('message', handleBrowserMessage);
      if (webviewBridge) {
        webviewBridge.removeEventListener('message', handleWebViewMessage);
      }
    };
  }, []);

  // Detect if modelUrl is a 2D image (base64 DataURL or standard image url)
  const isImageUrl = useMemo(() => {
    if (!modelUrl) return false;
    return (
      modelUrl.startsWith('data:image/') ||
      modelUrl.startsWith('blob:') ||
      /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(modelUrl)
    );
  }, [modelUrl]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 1.5, 4.5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        {showBlackBg && <color attach="background" args={['#000000']} />}
        <SceneLights theme={theme} hologramMode={hologramMode} />
        <fog attach="fog" args={['#020408', 10, 22]} />

        <CanvasRecorderController
          productName={productName}
          isRecording={isRecording}
          setIsRecording={setIsRecording}
          recordingFormat={recordingFormat}
          setRecordingFormat={setRecordingFormat}
          setHideDecorations={setHideDecorations}
          setShowBlackBg={setShowBlackBg}
        />

        <Suspense fallback={null}>
          {!hideDecorations && (
            <Stars radius={30} depth={50} count={280} factor={2} saturation={0.4} fade speed={0.4} />
          )}

          {/* Emitter projection cone */}
          {!hideDecorations && modelUrl && <ProjectionCone color={theme.primaryColor} />}

          {/* 3D content */}
          <Float speed={0.8} rotationIntensity={0.05} floatIntensity={0.25}>
            <FaceRotationWrapper facePosition={facePosition}>
              {modelUrl ? (
                isImageUrl ? (
                  <HologramVolumetricParticles
                    url={modelUrl}
                    theme={theme}
                    rotationSpeed={rotationSpeed}
                    glowIntensity={glowIntensity}
                    hideDecorations={hideDecorations}
                  />
                ) : (
                  <ModelErrorBoundary
                    fallback={
                      fallbackImageUrl ? (
                        <HologramVolumetricParticles
                          url={fallbackImageUrl}
                          theme={theme}
                          rotationSpeed={rotationSpeed}
                          glowIntensity={glowIntensity}
                          hideDecorations={hideDecorations}
                        />
                      ) : (
                        <PlaceholderOrb theme={theme} />
                      )
                    }
                  >
                    <HologramModel
                      url={modelUrl}
                      theme={theme}
                      rotationSpeed={rotationSpeed}
                      glowIntensity={glowIntensity}
                      hologramMode={hologramMode}
                      productColor={productColor}
                      hideDecorations={hideDecorations}
                    />
                  </ModelErrorBoundary>
                )
              ) : isGenerating3D ? (
                <GeneratingIndicator theme={theme} />
              ) : (
                <PlaceholderOrb theme={theme} />
              )}
            </FaceRotationWrapper>
          </Float>

          {!hideDecorations && <HoloFloor color={theme.primaryColor} />}
          {!hideDecorations && <ParticleCloud count={particleCount} color={theme.primaryColor} />}
        </Suspense>

        <OrbitControls
          enablePan={false}
          enableZoom
          minDistance={2}
          maxDistance={9}
          makeDefault
        />
      </Canvas>

      {/* Recording progress overlay */}
      {isRecording && (
        <>
          <style>{`
            @keyframes holoExporterSpin {
              0% { transform: translate(-50%, -50%) rotate(0deg); }
              100% { transform: translate(-50%, -50%) rotate(360deg); }
            }
            .holo-exporter-spinner {
              position: absolute;
              top: 50%;
              left: 50%;
              width: 36px;
              height: 36px;
              border-radius: 50%;
              border: 3px solid var(--holo-cyan);
              border-top-color: transparent;
              animation: holoExporterSpin 1.0s linear infinite;
              transform-origin: center center;
              box-shadow: 0 0 15px rgba(0, 212, 255, 0.4);
            }
          `}</style>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(2, 4, 8, 0.9)',
            border: '1px solid var(--border-holo)',
            borderRadius: 12,
            padding: '24px 32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            zIndex: 100,
            boxShadow: '0 0 35px rgba(0, 212, 255, 0.4)',
            pointerEvents: 'none',
            minWidth: '240px',
          }}>
            <div style={{ height: '50px', position: 'relative', width: '100%' }}>
              <div className="holo-exporter-spinner" />
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.82rem',
              color: '#fff',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              textAlign: 'center',
            }}>
              Grabando Video {recordingFormat.toUpperCase()}...
            </span>
            <span style={{
              fontSize: '0.68rem',
              color: 'var(--text-muted)',
              textAlign: 'center',
              lineHeight: '1.4',
            }}>
              Capturando rotación 360° (4s)<br/>
              {recordingFormat === 'mp4' ? 'Fondo Negro Puro (Light Off)' : 'Fondo Transparente (Cutout)'}
            </span>
          </div>
        </>
      )}

      {/* Overlay badges */}
      <MockBanner isMock={isMock} modelUrl={modelUrl} />
      {facePosition && facePosition !== 'NONE' && facePosition !== 'OFFLINE' && (
        <div style={{
          position: 'absolute',
          top: '2.5rem',
          right: '1rem',
          background: 'rgba(0,212,255,0.15)',
          border: '1px solid rgba(0,212,255,0.4)',
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: '0.62rem',
          color: '#00d4ff',
          fontFamily: 'var(--font-mono)',
          pointerEvents: 'none',
        }}>
          Sensor: Detección {facePosition}
        </div>
      )}

      {isGenerating3D && !modelUrl && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none',
        }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--holo-cyan)', marginTop: '8rem' }}>
            Convirtiendo imagen a 3D…
          </p>
        </div>
      )}

      {isGenerating3D && modelUrl && (
        <div style={{
          position: 'absolute',
          bottom: '2.5rem',
          right: '1rem',
          background: 'rgba(123,47,255,0.15)',
          border: '1px solid rgba(123,47,255,0.4)',
          borderRadius: 4,
          padding: '4px 10px',
          fontSize: '0.62rem',
          color: '#a855f7',
          fontFamily: 'var(--font-mono)',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '0 0 15px rgba(123,47,255,0.2)',
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#a855f7',
            display: 'inline-block',
            animation: 'flicker 1.5s infinite alternate'
          }} />
          <span>IA: Creando Malla 3D Poligonal…</span>
        </div>
      )}
    </div>
  );
}
