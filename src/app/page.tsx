'use client';

import dynamic from 'next/dynamic';
import { Suspense, useCallback, useState } from 'react';
import { useCampaignStore } from '@presentation/stores/campaignStore';
import ImageUploader from '@presentation/components/upload/ImageUploader';
import GeneratingScreen from '@presentation/components/generating/GeneratingScreen';
import CampaignEditor from '@presentation/components/campaign/CampaignEditor';
import { extractDominantColor } from '@presentation/utils/colorExtractor';
import styles from './page.module.css';

// Lazy-load the heavy 3D viewer (client-only)
const HologramViewer = dynamic(
  () => import('@presentation/components/hologram/HologramViewer'),
  { ssr: false, loading: () => <HologramPlaceholder /> },
);

function HologramPlaceholder() {
  return (
    <div className={styles.hologramPlaceholder}>
      <div className={styles.placeholderOrb} />
      <p className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Inicializando motor 3D…
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Default theme (before campaign is created)
// ─────────────────────────────────────────────────────────────
const DEFAULT_THEME = {
  name: 'Neon Azul',
  primaryColor: '#00d4ff',
  secondaryColor: '#7800ff',
  accentColor: '#00ff88',
  glowColor: '#00d4ff',
  preset: 'neon-blue' as const,
};

// ─────────────────────────────────────────────────────────────
// Generation steps config
// ─────────────────────────────────────────────────────────────
const STAGES = [
  { progress: 15, message: 'Analizando imágenes con IA…' },
  { progress: 35, message: 'Identificando producto y audiencia…' },
  { progress: 55, message: 'Generando conceptos creativos…' },
  { progress: 75, message: 'Escribiendo variantes de copy…' },
  { progress: 90, message: 'Preparando escena holográfica…' },
];

// ─────────────────────────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────────────────────────
export default function HomePage() {
  const {
    currentStep,
    currentCampaign,
    uploadedImages,
    productName,
    hologramSettings,
    model3DUrl,
    isMockModel,
    isGenerating3D,
    productColor,
    setStep,
    setGenerating,
    setGenerating3D,
    setGenerationProgress,
    setCampaign,
    setProduct,
    setModel3D,
    setAIModel3D,
    setProductColor,
    setCampaignFallbackReason,
  } = useCampaignStore();

  const [generationError, setGenerationError] = useState<string | null>(null);
  const [useDemoMode, setUseDemoMode] = useState<boolean>(false);

  // ── Main generation handler ──────────────────────────────
  const handleImagesReady = useCallback(async () => {
    setGenerationError(null);
    setStep('generating');
    setGenerating(true);

    try {
      // Extract dominant color of the product photo
      const primaryImage = uploadedImages[0];
      if (primaryImage) {
        try {
          const color = await extractDominantColor(primaryImage.previewUrl);
          setProductColor(color);
        } catch (colorErr) {
          console.error('Failed to extract product color:', colorErr);
        }
      }

      // Animate progress stages in parallel with actual API calls
      let stageIdx = 0;
      const progressInterval = setInterval(() => {
        if (stageIdx < STAGES.length) {
          const s = STAGES[stageIdx];
          setGenerationProgress(s.progress, s.message);
          stageIdx++;
        }
      }, 700);

      const imagePayload = uploadedImages.map((img) => ({
        url: img.previewUrl,
        filename: img.name,
        size: img.file.size,
        mimeType: img.file.type,
      }));

      // 1. Fetch campaign text + analysis (BLOCKING)
      const campaignResponse = await fetch('/api/campaigns/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName,
          images: imagePayload,
          campaignName: `Campaña ${productName} ${new Date().toLocaleDateString('es')}`,
          forceMock: useDemoMode,
        }),
      });

      clearInterval(progressInterval);

      if (!campaignResponse.ok) {
        const errData = await campaignResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${campaignResponse.status}`);
      }

      const campaignData = await campaignResponse.json();
      if (!campaignData.success) {
        throw new Error(campaignData.error || 'Error en la generación de campaña');
      }

      setCampaignFallbackReason(campaignData.isMockFallback ? campaignData.fallbackReason : null);

      // 2. Set campaign data and transition to Editor immediately!
      const { Campaign } = await import('@domain/entities/Campaign');
      const { Product } = await import('@domain/entities/Product');

      const cd = campaignData.campaign;
      const campaign = new Campaign({
        ...cd,
        createdAt: new Date(cd.createdAt),
        updatedAt: new Date(cd.updatedAt),
      });
      const product = new Product(campaignData.product);

      setCampaign(campaign);
      setProduct(product);
      setGenerationProgress(100, '¡Campaña holográfica lista! ✨');

      // Default the viewer to the 2.5D point cloud view of the uploaded image immediately
      setModel3D(primaryImage.previewUrl, true);
      setAIModel3D("");
      
      // Move to editor screen
      await new Promise((r) => setTimeout(r, 400));
      setStep('editor');
      setGenerating(false);

      // 3. Trigger 3D model generation asynchronously in the background!
      setGenerating3D(true);
      console.log('Starting background 3D model generation...');

      fetch('/api/ai/image-to-3d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: primaryImage.previewUrl,
          productName,
          quality: 'quality',
          forceMock: useDemoMode,
        }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const errData = await r.json().catch(() => ({}));
            throw new Error(errData.error || `Error ${r.status}`);
          }
          return r.json();
        })
        .then((m) => {
          console.log('Background 3D generation completed successfully:', m);
          if (m.success) {
            setAIModel3D(m.modelUrl);
            if (m.isMock) {
              // Keep 2.5D point cloud if mock model
              setModel3D(primaryImage.previewUrl, true);
            } else {
              // Real generated model: automatically load it!
              setModel3D(m.modelUrl, false);
            }
          } else {
            console.warn('Background 3D model generation returned success=false');
          }
        })
        .catch((error) => {
          console.error('Background 3D generation failed:', error);
        })
        .finally(() => {
          setGenerating3D(false);
        });

    } catch (err) {
      console.error('Generation error:', err);
      setGenerationError(err instanceof Error ? err.message : 'Error desconocido en la generación');
      setStep('upload');
      setGenerating(false);
    }
  }, [uploadedImages, productName, useDemoMode, setStep, setGenerating, setGenerating3D, setGenerationProgress, setCampaign, setProduct, setModel3D, setAIModel3D, setProductColor, setCampaignFallbackReason]);

  const theme = currentCampaign?.theme ?? DEFAULT_THEME;

  return (
    <div className={styles.appShell}>

      {/* ── Navigation Bar ── */}
      <nav className={styles.navbar}>
        <div className={styles.navBrand}>
          <div className={styles.logoMark}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"
                stroke="#00d4ff" strokeWidth="1.5" fill="rgba(0,212,255,0.1)" />
              <polygon points="12 6 18 9.5 18 14.5 12 18 6 14.5 6 9.5 12 6"
                stroke="#7b2fff" strokeWidth="1" fill="rgba(123,47,255,0.1)" />
              <circle cx="12" cy="12" r="2" fill="#00d4ff" />
            </svg>
          </div>
          <span className={styles.brandName}>HoloForge</span>
          <span className={styles.brandTag}>AI 3D</span>
        </div>

        {/* Step breadcrumbs */}
        <div className={styles.navSteps}>
          {[
            { id: 'upload',     label: '① Subir Foto' },
            { id: 'generating', label: '② Generar IA' },
            { id: 'editor',     label: '③ Editor 3D' },
            { id: 'preview',    label: '④ Exportar' },
          ].map((step) => {
            const steps = ['upload', 'generating', 'editor', 'preview'];
            const curIdx  = steps.indexOf(currentStep);
            const stepIdx = steps.indexOf(step.id);
            return (
              <div
                key={step.id}
                className={`${styles.navStep} ${currentStep === step.id ? styles.navStepActive : ''} ${stepIdx < curIdx ? styles.navStepDone : ''}`}
              >
                {step.label}
              </div>
            );
          })}
        </div>

        <div className={styles.navRight}>
          <span className="badge badge-holo animate-flicker">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--holo-cyan)', display: 'inline-block' }} />
            Motor 3D Activo
          </span>
        </div>
      </nav>

      {/* ── Main split layout ── */}
      <div className={styles.mainLayout}>

        {/* LEFT: 3D Hologram Viewer — always visible */}
        <section className={styles.hologramSection}>
          <div className={styles.hologramFrame}>
            {/* HUD corners */}
            {['topLeft', 'topRight', 'btmLeft', 'btmRight'].map((pos) => (
              <div key={pos} className={`${styles.frameCorner} ${styles[pos]}`} />
            ))}

            {/* Top HUD: model status */}
            <div className={styles.hudTop}>
              {isGenerating3D ? (
                <span className="badge badge-holo animate-flicker" style={{ fontSize: '0.65rem' }}>
                  ⚡ Creando malla 3D en segundo plano…
                </span>
              ) : model3DUrl && !isMockModel ? (
                <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>
                  ◉ Malla 3D Cargada
                </span>
              ) : model3DUrl ? (
                <span className="badge badge-holo" style={{ fontSize: '0.65rem' }}>
                  ◉ Holograma 2.5D Activo
                </span>
              ) : (
                <span className="badge" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                  ○ Esperando imagen
                </span>
              )}
            </div>

            <Suspense fallback={<HologramPlaceholder />}>
              <HologramViewer
                modelUrl={model3DUrl}
                fallbackImageUrl={uploadedImages[0]?.previewUrl}
                isGenerating3D={isGenerating3D}
                isMock={isMockModel}
                theme={theme}
                rotationSpeed={hologramSettings.rotationSpeed}
                glowIntensity={hologramSettings.glowIntensity}
                particleCount={hologramSettings.particleCount}
                hologramMode={hologramSettings.hologramMode}
                productColor={productColor}
                bloomStrength={hologramSettings.bloomStrength}
                chromaticAberration={hologramSettings.chromaticAberration}
                scanlineOpacity={hologramSettings.scanlineOpacity}
              />
            </Suspense>
          </div>

          {/* Bottom HUD bar */}
          <div className={styles.hudBottom}>
            <div className={styles.hudStat}>
              <span className={styles.hudLabel}>MOTOR</span>
              <span className={styles.hudValue}>Three.js R3F</span>
            </div>
            <div className={styles.hudDivider} />
            <div className={styles.hudStat}>
              <span className={styles.hudLabel}>SHADER</span>
              <span className={styles.hudValue}>GLSL Hologram</span>
            </div>
            <div className={styles.hudDivider} />
            <div className={styles.hudStat}>
              <span className={styles.hudLabel}>MODELO</span>
              <span className={styles.hudValue}>{model3DUrl ? 'GLB Cargado' : '— '}</span>
            </div>
            <div className={styles.hudDivider} />
            <div className={styles.hudStat}>
              <span className={styles.hudLabel}>PARTÍCULAS</span>
              <span className={styles.hudValue}>{hologramSettings.particleCount}</span>
            </div>
          </div>
        </section>

        {/* RIGHT: Step content */}
        <section className={styles.contentSection}>
          {currentStep === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', width: '100%' }}>
              {generationError && (
                <div style={{
                  background: 'rgba(255, 59, 48, 0.12)',
                  border: '1px solid #ff3b30',
                  borderRadius: 12,
                  padding: '16px',
                  color: '#ff6b6b',
                  fontSize: '0.82rem',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '0.88rem' }}>
                    <span>⚠️</span> ERROR DE CONEXIÓN AI
                  </div>
                  <div>
                    {generationError.includes('Exhausted balance') || generationError.includes('Locked') || generationError.includes('403') ? (
                      <>
                        La clave de <strong>fal.ai</strong> no tiene saldo disponible o está inactiva. Para probar sin costo, puedes activar el <strong>Modo Demo</strong> abajo.
                        <br/><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginTop: '6px' }}>Detalle: {generationError}</span>
                      </>
                    ) : generationError.includes('Gemini API has not been used') || generationError.includes('disabled') ? (
                      <>
                        La API de <strong>Gemini</strong> no está habilitada en tu proyecto de Google Cloud Console. Puedes activar el <strong>Modo Demo</strong> abajo para probar de forma simulada.
                        <br/><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginTop: '6px' }}>Detalle: {generationError}</span>
                      </>
                    ) : (
                      <>
                        Ocurrió un error al consultar las APIs de IA.
                        <br/><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginTop: '6px' }}>Detalle: {generationError}</span>
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                    <button 
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setGenerationError(null);
                        setUseDemoMode(true);
                      }}
                      style={{ borderColor: 'var(--holo-cyan)', color: 'var(--holo-cyan)', padding: '6px 12px', fontSize: '0.7rem' }}
                    >
                      Activar Modo Demo (Simulado)
                    </button>
                    <button 
                      className="btn btn-ghost btn-sm"
                      onClick={() => setGenerationError(null)}
                      style={{ padding: '6px 12px', fontSize: '0.7rem', color: 'var(--text-muted)' }}
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              )}

              {/* Demo Mode Toggle */}
              <div style={{
                background: useDemoMode ? 'rgba(0, 212, 255, 0.08)' : 'rgba(255,255,255,0.02)',
                border: useDemoMode ? '1px solid var(--holo-cyan)' : '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.3s ease'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: useDemoMode ? 'var(--holo-cyan)' : 'var(--text-main)' }}>
                    Modo de Simulación (Demo)
                  </span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                    Bypassa las APIs de pago de Gemini y fal.ai y simula la generación de campaña.
                  </span>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: '34px', height: '20px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={useDemoMode}
                    onChange={(e) => {
                      setUseDemoMode(e.target.checked);
                      if (e.target.checked) setGenerationError(null);
                    }}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: useDemoMode ? 'var(--holo-cyan)' : 'rgba(255,255,255,0.1)',
                    borderRadius: '20px',
                    transition: '0.3s'
                  }}>
                    <span style={{
                      position: 'absolute',
                      content: '""',
                      height: '14px', width: '14px',
                      left: useDemoMode ? '16px' : '3px',
                      bottom: '3px',
                      backgroundColor: '#fff',
                      borderRadius: '50%',
                      transition: '0.3s'
                    }}/>
                  </span>
                </label>
              </div>

              <ImageUploader onImagesReady={handleImagesReady} />
            </div>
          )}
          {currentStep === 'generating' && <GeneratingScreen />}
          {(currentStep === 'editor' || currentStep === 'preview') && <CampaignEditor />}
        </section>
      </div>

      {/* Footer status bar */}
      <footer className={styles.statusBar}>
        <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          HoloForge v2.0 · Clean Architecture · Next.js 16 · Three.js/R3F · fal.ai Image→3D
        </span>
        <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--holo-cyan)' }}>
          ◉ WebGL holográfico activo
        </span>
      </footer>
    </div>
  );
}
