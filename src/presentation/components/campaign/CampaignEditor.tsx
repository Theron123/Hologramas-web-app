'use client';

import { useState } from 'react';
import { useCampaignStore } from '@presentation/stores/campaignStore';
import type { CampaignTheme } from '@domain/entities/Campaign';
import styles from './CampaignEditor.module.css';

const THEMES: CampaignTheme[] = [
  {
    name: 'Neon Azul',
    primaryColor: '#00d4ff',
    secondaryColor: '#7800ff',
    accentColor: '#00ff88',
    glowColor: '#00d4ff',
    preset: 'neon-blue',
  },
  {
    name: 'Oro Premium',
    primaryColor: '#ffd700',
    secondaryColor: '#ff8c00',
    accentColor: '#fffacd',
    glowColor: '#ffd700',
    preset: 'gold-premium',
  },
  {
    name: 'Matrix Verde',
    primaryColor: '#00ff41',
    secondaryColor: '#003b00',
    accentColor: '#39ff14',
    glowColor: '#00ff41',
    preset: 'matrix-green',
  },
  {
    name: 'Cyberpunk',
    primaryColor: '#ff2dbd',
    secondaryColor: '#7b2fff',
    accentColor: '#ff9d00',
    glowColor: '#ff2dbd',
    preset: 'cyberpunk-violet',
  },
];

const PLATFORM_LABELS: Record<string, string> = {
  instagram: '📸 Instagram',
  linkedin: '💼 LinkedIn',
  tiktok: '🎵 TikTok',
  ooh: '🏙️ OOH/Vallas',
  facebook: '👥 Facebook',
};

export default function CampaignEditor() {
  const {
    currentCampaign,
    currentProduct,
    hologramSettings,
    updateHologramSettings,
    updateCampaignTheme,
    activeVariantIndex,
    setActiveVariant,
    setStep,
    reset,
    uploadedImages,
    model3DUrl,
    aiModel3DUrl,
    isMockModel,
    setModel3D,
    campaignFallbackReason,
  } = useCampaignStore();

  const [activeTab, setActiveTab] = useState<'copy' | 'hologram' | 'theme'>('copy');
  const [editingCopy, setEditingCopy] = useState(false);
  const [editedHeadline, setEditedHeadline] = useState('');
  const [editedBody, setEditedBody] = useState('');

  if (!currentCampaign || !currentProduct) return null;

  const variants = currentCampaign.adCopyVariants;
  const activeVariant = variants[activeVariantIndex];
  const currentTheme = currentCampaign.theme;

  const downloadGLB = async () => {
    if (!model3DUrl) return;
    try {
      const response = await fetch(model3DUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProduct.name.toLowerCase().replace(/\s+/g, '_')}_modelo.glb`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download GLB, falling back to direct link", err);
      const a = document.createElement('a');
      a.href = model3DUrl;
      a.target = '_blank';
      a.download = `${currentProduct.name.toLowerCase().replace(/\s+/g, '_')}_modelo.glb`;
      a.click();
    }
  };

  const downloadPNG = async () => {
    if (!uploadedImages[0]) return;
    const imageUrl = uploadedImages[0].previewUrl;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProduct.name.toLowerCase().replace(/\s+/g, '_')}_cutout.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download PNG, falling back to direct link", err);
      const a = document.createElement('a');
      a.href = imageUrl;
      a.target = '_blank';
      a.download = `${currentProduct.name.toLowerCase().replace(/\s+/g, '_')}_cutout.png`;
      a.click();
    }
  };

  const startEditing = () => {
    setEditedHeadline(activeVariant?.headline ?? '');
    setEditedBody(activeVariant?.body ?? '');
    setEditingCopy(true);
  };

  return (
    <div className={styles.editorLayout}>
      {/* ── Sidebar: Campaign Info ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className="badge badge-green">
            <span className={styles.dot} />
            Campaña Lista
          </div>
          <h2 className={styles.campaignName}>{currentCampaign.name}</h2>
          <p className={styles.productMeta}>
            Producto: <strong>{currentProduct.name}</strong>
          </p>
          {currentProduct.aiAnalysis && (
            <div className={styles.analysisChips}>
              <span className="badge badge-holo">{currentProduct.aiAnalysis.productType}</span>
              <span className="badge badge-violet">{currentProduct.aiAnalysis.emotionalTone}</span>
            </div>
          )}
          {campaignFallbackReason && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.5rem 0.7rem',
                borderRadius: 6,
                background: 'rgba(255, 45, 189, 0.1)',
                border: '1px solid rgba(255, 45, 189, 0.35)',
                fontSize: '0.68rem',
                lineHeight: 1.4,
                color: 'var(--holo-pink)',
              }}
            >
              ⚠️ La IA real falló y este copy se generó con el simulador (Mock), no refleja un análisis
              real del producto.<br />
              <span style={{ color: 'var(--text-muted)' }}>Motivo: {campaignFallbackReason}</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          {(['copy', 'hologram', 'theme'] as const).map((tab) => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'copy' ? '✍️ Copy' : tab === 'hologram' ? '🌐 Holograma' : '🎨 Tema'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className={styles.tabContent}>
          {/* ── Copy Tab ── */}
          {activeTab === 'copy' && (
            <div className={styles.copySection}>
              <p className={styles.sectionLabel}>Plataformas</p>
              <div className={styles.variantList}>
                {variants.map((v, i) => (
                  <button
                    key={i}
                    className={`${styles.variantBtn} ${i === activeVariantIndex ? styles.activeVariant : ''}`}
                    onClick={() => setActiveVariant(i)}
                  >
                    <span className={`platform-tag platform-${v.platform}`}>
                      {PLATFORM_LABELS[v.platform] ?? v.platform}
                    </span>
                    <span className={styles.variantHeadline}>{v.headline}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Hologram Tab ── */}
          {activeTab === 'hologram' && (
            <div className={styles.controlsSection}>
              {/* Origen del Holograma selector */}
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.2rem' }}>
                <p className={styles.sectionLabel} style={{ marginBottom: '0.6rem' }}>Origen del Holograma</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {/* Option 1: Original image projection (default for mock mode) */}
                  {uploadedImages[0] && (
                    <button
                      className={`${styles.variantBtn} ${model3DUrl === uploadedImages[0].previewUrl ? styles.activeVariant : ''}`}
                      onClick={() => setModel3D(uploadedImages[0].previewUrl, true)}
                      style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '8px 12px' }}
                    >
                      <span style={{ fontSize: '1.1rem' }}>🖼️</span>
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-main)' }}>Imagen Real Proyectada</span>
                          <span className="badge badge-green" style={{ fontSize: '0.55rem', padding: '1px 4px' }}>Tu Producto</span>
                        </div>
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Proyección 2.5D con croma de fondo</span>
                      </div>
                    </button>
                  )}

                  {/* Option 2: AI-Generated / Mock 3D Model */}
                  {aiModel3DUrl && (
                    <button
                      className={`${styles.variantBtn} ${model3DUrl === aiModel3DUrl ? styles.activeVariant : ''}`}
                      onClick={() => setModel3D(aiModel3DUrl, isMockModel)}
                      style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '8px 12px' }}
                    >
                      <span style={{ fontSize: '1.1rem' }}>🤖</span>
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-main)' }}>
                            {isMockModel ? 'Modelo 3D Genérico (Demo)' : 'Modelo 3D Generado'}
                          </span>
                          <span className={`badge ${isMockModel ? 'badge-violet' : 'badge-holo'}`} style={{ fontSize: '0.55rem', padding: '1px 4px' }}>
                            {isMockModel ? 'Demo 3D' : 'Generado por IA'}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                          {isMockModel
                            ? 'Modelo 3D deportivo aproximado (Ferrari GLB)'
                            : 'Malla 3D poligonal generada por IA de tu producto'}
                        </span>
                      </div>
                    </button>
                  )}
                </div>
              </div>
              
              {/* Estilo del Holograma selector */}
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.2rem' }}>
                <p className={styles.sectionLabel} style={{ marginBottom: '0.6rem' }}>Estilo del Render</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                  {[
                    { mode: 'textured', label: '📸 Realista', desc: 'Color y textura' },
                    { mode: 'neon', label: '⚡ Neón', desc: 'Brillo energía' },
                    { mode: 'wireframe', label: '🕸️ Malla', desc: 'Wireframe 3D' },
                  ].map((styleOpt) => (
                    <button
                      key={styleOpt.mode}
                      className={`${styles.variantBtn} ${hologramSettings.hologramMode === styleOpt.mode ? styles.activeVariant : ''}`}
                      onClick={() => updateHologramSettings({ hologramMode: styleOpt.mode as any })}
                      style={{
                        padding: '6px 4px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        minHeight: '52px'
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: '0.72rem', color: 'var(--text-main)' }}>{styleOpt.label}</span>
                      <span style={{ fontSize: '0.52rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: '1.1' }}>{styleOpt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <p className={styles.sectionLabel}>Parámetros del Render</p>
              {[
                { key: 'rotationSpeed', label: 'Velocidad de Rotación', min: 0, max: 2, step: 0.1 },
                { key: 'glowIntensity', label: 'Intensidad de Brillo', min: 0.5, max: 3, step: 0.1 },
                { key: 'bloomStrength', label: 'Bloom / Resplandor', min: 0.5, max: 3, step: 0.1 },
                { key: 'chromaticAberration', label: 'Aberración Cromática', min: 0, max: 0.01, step: 0.0005 },
                { key: 'scanlineOpacity', label: 'Líneas de Escaneo', min: 0, max: 1, step: 0.05 },
                { key: 'particleCount', label: 'Partículas', min: 0, max: 400, step: 10 },
              ].map((ctrl) => (
                <div key={ctrl.key} className={styles.sliderGroup}>
                  <div className={styles.sliderHeader}>
                    <span className={styles.sliderLabel}>{ctrl.label}</span>
                    <span className={styles.sliderValue}>
                      {hologramSettings[ctrl.key as keyof typeof hologramSettings]}
                    </span>
                  </div>
                  <input
                    type="range"
                    className={styles.slider}
                    min={ctrl.min}
                    max={ctrl.max}
                    step={ctrl.step}
                    value={hologramSettings[ctrl.key as keyof typeof hologramSettings]}
                    onChange={(e) =>
                      updateHologramSettings({ [ctrl.key]: parseFloat(e.target.value) })
                    }
                  />
                </div>
              ))}

              {/* ── Exportar Holograma ── */}
              <div style={{ marginTop: '1.5rem', paddingTop: '1.2rem', borderTop: '1px solid var(--border-subtle)' }}>
                <p className={styles.sectionLabel} style={{ marginBottom: '0.8rem' }}>Exportar Holograma</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  
                  {/* Download GLB Button */}
                  <button
                    className="btn btn-secondary"
                    onClick={downloadGLB}
                    disabled={!model3DUrl || model3DUrl.startsWith('data:image/') || model3DUrl.startsWith('blob:')}
                    style={{
                      justifyContent: 'flex-start',
                      gap: '0.6rem',
                      width: '100%',
                      padding: '10px 14px',
                      fontSize: '0.78rem',
                      opacity: (!model3DUrl || model3DUrl.startsWith('data:image/') || model3DUrl.startsWith('blob:')) ? 0.5 : 1,
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>📦</span>
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', flex: 1 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Descargar Modelo (.GLB)</span>
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Malla 3D interactiva en tiempo real</span>
                    </div>
                  </button>

                  {/* Download PNG Button */}
                  <button
                    className="btn btn-secondary"
                    onClick={downloadPNG}
                    disabled={!uploadedImages[0]}
                    style={{
                      justifyContent: 'flex-start',
                      gap: '0.6rem',
                      width: '100%',
                      padding: '10px 14px',
                      fontSize: '0.78rem',
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>🖼️</span>
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', flex: 1 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Descargar Imagen (.PNG)</span>
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Recorte del producto (fondo transparente)</span>
                    </div>
                  </button>

                  {/* Export Video WebM Button */}
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('hologram-export-start', {
                        detail: { format: 'webm', productName: currentProduct.name }
                      }));
                    }}
                    disabled={!model3DUrl}
                    style={{
                      justifyContent: 'flex-start',
                      gap: '0.6rem',
                      width: '100%',
                      padding: '10px 14px',
                      fontSize: '0.78rem',
                      background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(123, 47, 255, 0.15))',
                      border: '1px solid var(--border-holo)',
                      boxShadow: 'var(--glow-sm)',
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>🎬</span>
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', flex: 1 }}>
                      <span style={{ fontWeight: 600, color: 'var(--holo-cyan)' }}>Exportar Video WebM</span>
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Bucle 360° transparente (4s)</span>
                    </div>
                  </button>

                  {/* Export Video MP4 Button */}
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('hologram-export-start', {
                        detail: { format: 'mp4', productName: currentProduct.name }
                      }));
                    }}
                    disabled={!model3DUrl}
                    style={{
                      justifyContent: 'flex-start',
                      gap: '0.6rem',
                      width: '100%',
                      padding: '10px 14px',
                      fontSize: '0.78rem',
                      background: 'linear-gradient(135deg, rgba(123, 47, 255, 0.2), rgba(0, 212, 255, 0.05))',
                      border: '1px solid rgba(123, 47, 255, 0.4)',
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>⬛</span>
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', flex: 1 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Exportar Video MP4</span>
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Fondo negro puro para pantallas/ventiladores</span>
                    </div>
                  </button>

                </div>
              </div>

            </div>
          )}

          {/* ── Theme Tab ── */}
          {activeTab === 'theme' && (
            <div className={styles.themeSection}>
              <p className={styles.sectionLabel}>Paleta Holográfica</p>
              <div className={styles.themeGrid}>
                {THEMES.map((theme) => (
                  <button
                    key={theme.preset}
                    className={`${styles.themeCard} ${currentTheme.preset === theme.preset ? styles.activeTheme : ''}`}
                    onClick={() => updateCampaignTheme(theme)}
                    style={{ '--theme-color': theme.primaryColor } as React.CSSProperties}
                  >
                    <div
                      className={styles.themePreview}
                      style={{
                        background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})`,
                      }}
                    />
                    <span className={styles.themeName}>{theme.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button className="btn btn-primary" onClick={() => setStep('preview')} id="preview-campaign-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            Vista Previa
          </button>
          <button className="btn btn-secondary" onClick={reset} id="restart-btn">
            Nueva Campaña
          </button>
        </div>
      </aside>

      {/* ── Main: Copy Display ── */}
      <main className={styles.mainPanel}>
        {activeVariant && (
          <div className={`${styles.copyCard} holo-card`} key={activeVariantIndex}>
            <div className={styles.scanLine} />
            {/* Platform badge */}
            <div className={styles.copyHeader}>
              <span className={`platform-tag platform-${activeVariant.platform}`}>
                {PLATFORM_LABELS[activeVariant.platform]}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={startEditing}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Editar
              </button>
            </div>

            {/* Headline */}
            <div className={styles.headline}>
              {editingCopy ? (
                <textarea
                  className={`input-holo ${styles.editArea}`}
                  value={editedHeadline}
                  onChange={(e) => setEditedHeadline(e.target.value)}
                  rows={2}
                />
              ) : (
                <h2>{activeVariant.headline}</h2>
              )}
            </div>

            {/* Tagline */}
            <div className={styles.tagline}>
              <span className="font-mono text-holo" style={{ fontSize: '0.8rem', letterSpacing: '0.1em' }}>
                TAGLINE
              </span>
              <p className={styles.taglineText}>{activeVariant.tagline}</p>
            </div>

            {/* Body */}
            <div className={styles.bodyText}>
              <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                COPY
              </span>
              {editingCopy ? (
                <textarea
                  className={`input-holo ${styles.editArea}`}
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                  rows={5}
                />
              ) : (
                <p className={styles.bodyParagraph}>{activeVariant.body}</p>
              )}
            </div>

            {/* CTA */}
            <div className={styles.ctaSection}>
              <span className="badge badge-holo">{activeVariant.cta}</span>
            </div>

            {/* Hashtags */}
            {activeVariant.hashtags.length > 0 && (
              <div className={styles.hashtags}>
                {activeVariant.hashtags.map((tag, i) => (
                  <span key={i} className={styles.hashtag}>{tag}</span>
                ))}
              </div>
            )}

            {/* Save edit */}
            {editingCopy && (
              <div className={styles.editActions}>
                <button className="btn btn-primary btn-sm" onClick={() => setEditingCopy(false)}>
                  Guardar Cambios
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingCopy(false)}>
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}

        {/* AI Analysis card */}
        {currentProduct.aiAnalysis && (
          <div className={`${styles.analysisCard} holo-card`}>
            <h3 className={styles.analysisTitle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              Análisis de IA
            </h3>
            <div className={styles.analysisGrid}>
              {[
                { label: 'Audiencia', value: currentProduct.aiAnalysis.targetAudience },
                { label: 'Tono', value: currentProduct.aiAnalysis.emotionalTone },
                { label: 'Ángulo', value: currentProduct.aiAnalysis.marketingAngle },
              ].map((item) => (
                <div key={item.label} className={styles.analysisStat}>
                  <span className={styles.statLabel}>{item.label}</span>
                  <span className={styles.statValue}>{item.value}</span>
                </div>
              ))}
            </div>
            <div className={styles.featuresWrap}>
              {currentProduct.aiAnalysis.keyFeatures.map((f, i) => (
                <span key={i} className="badge badge-holo" style={{ fontSize: '0.7rem' }}>{f}</span>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
