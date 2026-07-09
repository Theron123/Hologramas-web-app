'use client';

import { useCallback, useRef, useState } from 'react';
import { useCampaignStore, type UploadedImage } from '@presentation/stores/campaignStore';
import styles from './ImageUploader.module.css';

interface ImageUploaderProps {
  onImagesReady: () => void;
}

export default function ImageUploader({ onImagesReady }: ImageUploaderProps) {
  const { uploadedImages, productName, addUploadedImage, removeUploadedImage, setProductName, setStep } =
    useCampaignStore();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    (files: FileList | File[]) => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      const fileArray = Array.from(files).filter((f) => validTypes.includes(f.type));

      fileArray.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img: UploadedImage = {
            id: crypto.randomUUID(),
            file,
            previewUrl: e.target?.result as string,
            name: file.name,
          };
          addUploadedImage(img);
        };
        reader.readAsDataURL(file);
      });
    },
    [addUploadedImage],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles],
  );

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
  };

  const handleGenerate = () => {
    if (uploadedImages.length === 0 || !productName.trim()) return;
    onImagesReady();
  };

  // Calculations for quality metrics
  // 1. Geometric Precision and Texture (based on image count)
  const getGeometricMetric = () => {
    const count = uploadedImages.length;
    if (count === 0) {
      return {
        pct: 0,
        status: 'Sin imágenes',
        badgeClass: 'badge-holo',
        tip: 'Sube al menos una foto para comenzar a proyectar el holograma.',
        color: 'var(--text-muted)'
      };
    }
    if (count === 1) {
      return {
        pct: 50,
        status: 'Básico (Vista Única)',
        badgeClass: 'badge-violet',
        tip: '📸 Vista única. Agrega más fotos o ángulos para enriquecer el análisis de la IA y la textura del holograma.',
        color: 'var(--holo-violet)'
      };
    }
    if (count === 2) {
      return {
        pct: 80,
        status: 'Bueno (Multi-perspectiva)',
        badgeClass: 'badge-holo',
        tip: '⚡ Vista múltiple. Buen análisis tridimensional y de geometría.',
        color: 'var(--holo-cyan)'
      };
    }
    return {
      pct: 100,
      status: 'Excelente (Carrusel Completo)',
      badgeClass: 'badge-green',
      tip: '🌟 Carrusel completo. Máxima fidelidad de textura y reconstrucción 3D optimizada por IA.',
      color: 'var(--holo-green)'
    };
  };

  // 2. Ad Copy Relevance (based on product name length/specificity)
  const getCopyMetric = () => {
    const trimmedName = productName.trim();
    if (trimmedName.length === 0) {
      return {
        pct: 0,
        status: 'Vacío',
        badgeClass: 'badge-holo',
        tip: 'Escribe el nombre del producto para generar el copy publicitario.',
        color: 'var(--text-muted)'
      };
    }
    if (trimmedName.length < 4) {
      return {
        pct: 10,
        status: 'Insuficiente',
        badgeClass: 'badge-violet',
        tip: 'Nombre muy corto. Escribe un nombre descriptivo.',
        color: 'var(--holo-pink)'
      };
    }
    if (trimmedName.length <= 10) {
      return {
        pct: 50,
        status: 'Genérico',
        badgeClass: 'badge-violet',
        tip: "💡 Nombre simple (ej. 'Zapatos'). Agrega marca y modelo (ej. 'Zapatillas de correr Nike Air') para obtener textos de campaña sumamente personalizados.",
        color: 'var(--holo-violet)'
      };
    }
    return {
      pct: 100,
      status: 'Excelente',
      badgeClass: 'badge-green',
      tip: '✨ ¡Excelente! El nombre detallado permite a la IA afinar la terminología de tu marca.',
      color: 'var(--holo-green)'
    };
  };

  const geoMetric = getGeometricMetric();
  const copyMetric = getCopyMetric();

  return (
    <div className={styles.uploaderContainer}>
      {/* Header */}
      <div className={styles.header}>
        <div className={`badge badge-holo ${styles.stepBadge}`}>
          <span className={styles.dot} />
          Paso 1 de 3
        </div>
        <h1 className="text-display" style={{ marginTop: '1rem' }}>
          Sube tu producto
        </h1>
        <p className={styles.subtitle}>
          Una foto o un carrusel — la IA generará una campaña completa
        </p>
      </div>

      {/* Product Name Input */}
      <div className={styles.inputWrapper}>
        <label className={styles.label} htmlFor="product-name-input">
          Nombre del Producto
        </label>
        <input
          id="product-name-input"
          type="text"
          className="input-holo"
          placeholder="ej. Auriculares Pro X1, Perfume Élite, Laptop Zenbook..."
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
        />
      </div>

      {/* Drop Zone */}
      <div
        className={`${styles.dropZone} ${isDragging ? styles.dragging : ''} holo-card`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Zona de carga de imágenes"
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
      >
        <div className={styles.scanLine} />
        <div className={styles.dropIcon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p className={styles.dropTitle}>
          {isDragging ? '¡Suelta las imágenes aquí!' : 'Arrastra tus imágenes aquí'}
        </p>
        <p className={styles.dropSubtitle}>o haz clic para seleccionar • JPG, PNG, WEBP</p>
        <p className={styles.dropHint}>Soporta foto única o múltiples fotos (carrusel)</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className={styles.fileInput}
          onChange={handleFileSelect}
          aria-hidden="true"
        />
      </div>

      {/* Image Preview Grid */}
      {uploadedImages.length > 0 && (
        <div className={styles.previewSection}>
          <div className={styles.previewHeader}>
            <span className="text-holo font-mono" style={{ fontSize: '0.8rem' }}>
              {uploadedImages.length} imagen{uploadedImages.length > 1 ? 'es' : ''} cargada{uploadedImages.length > 1 ? 's' : ''}
            </span>
            {uploadedImages.length > 1 && (
              <span className="badge badge-violet">Modo Carrusel</span>
            )}
          </div>
          <div className={styles.previewGrid}>
            {uploadedImages.map((img, index) => (
              <div key={img.id} className={`${styles.previewItem} holo-card`}>
                {index === 0 && <span className={styles.primaryBadge}>Principal</span>}
                <img
                  src={img.previewUrl}
                  alt={img.name}
                  className={styles.previewImage}
                />
                <button
                  className={styles.removeBtn}
                  onClick={(e) => { e.stopPropagation(); removeUploadedImage(img.id); }}
                  aria-label={`Eliminar ${img.name}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
            {/* Add more button */}
            <div
              className={`${styles.addMoreBtn} holo-card`}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Campaign Optimization Widget */}
      <div className={`${styles.optimizationWidget} holo-card`}>
        <div className={styles.scanLine} />
        <h3 className={styles.widgetTitle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--holo-cyan)' }}>
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          Optimización de Campaña por IA
        </h3>
        
        <div className={styles.metricsContainer}>
          {/* Metric 1: Geometry & Texture */}
          <div className={styles.metricRow}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Precisión Geométrica / Textura</span>
              <span className={`badge ${geoMetric.badgeClass}`} style={{ textTransform: 'none', letterSpacing: 'normal' }}>
                {geoMetric.status}
              </span>
            </div>
            <div className="progress-bar" style={{ height: '6px', background: 'rgba(255, 255, 255, 0.05)', marginTop: '0.4rem' }}>
              <div 
                className="progress-fill" 
                style={{ 
                  width: `${geoMetric.pct}%`, 
                  background: `linear-gradient(90deg, var(--holo-violet), ${geoMetric.color})`,
                  height: '100%',
                  borderRadius: 'var(--radius-full)',
                  transition: 'width 0.4s ease-in-out'
                }} 
              />
            </div>
            <p className={styles.metricTip}>{geoMetric.tip}</p>
          </div>

          {/* Metric 2: Ad Copy Relevance */}
          <div className={styles.metricRow}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Relevancia del Copy de Campaña</span>
              <span className={`badge ${copyMetric.badgeClass}`} style={{ textTransform: 'none', letterSpacing: 'normal' }}>
                {copyMetric.status}
              </span>
            </div>
            <div className="progress-bar" style={{ height: '6px', background: 'rgba(255, 255, 255, 0.05)', marginTop: '0.4rem' }}>
              <div 
                className="progress-fill" 
                style={{ 
                  width: `${copyMetric.pct}%`, 
                  background: `linear-gradient(90deg, var(--holo-pink), ${copyMetric.color})`,
                  height: '100%',
                  borderRadius: 'var(--radius-full)',
                  transition: 'width 0.4s ease-in-out'
                }} 
              />
            </div>
            <p className={styles.metricTip}>{copyMetric.tip}</p>
          </div>
        </div>
      </div>

      {/* CTA Button */}
      <button
        className={`btn btn-primary btn-lg ${styles.generateBtn}`}
        onClick={handleGenerate}
        disabled={uploadedImages.length === 0 || !productName.trim()}
        id="generate-campaign-btn"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        Generar Campaña Holográfica
      </button>
    </div>
  );
}

