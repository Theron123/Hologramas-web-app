'use client';

import { useEffect } from 'react';
import { useCampaignStore } from '@presentation/stores/campaignStore';
import styles from './GeneratingScreen.module.css';

const STEPS = [
  { id: 1, message: 'Analizando imágenes con IA...', icon: '🔍' },
  { id: 2, message: 'Identificando producto y audiencia...', icon: '🎯' },
  { id: 3, message: 'Generando conceptos creativos...', icon: '✨' },
  { id: 4, message: 'Escribiendo variantes de copy...', icon: '✍️' },
  { id: 5, message: 'Preparando escena holográfica...', icon: '🌐' },
  { id: 6, message: 'Calibrando efectos 3D...', icon: '⚡' },
];

export default function GeneratingScreen() {
  const { generationProgress, generationMessage } = useCampaignStore();

  const currentStepIndex = Math.min(
    Math.floor((generationProgress / 100) * STEPS.length),
    STEPS.length - 1,
  );

  return (
    <div className={styles.container}>
      {/* Central holographic orb */}
      <div className={styles.orb}>
        <div className={styles.orbCore} />
        <div className={styles.orbRing1} />
        <div className={styles.orbRing2} />
        <div className={styles.orbRing3} />
        <div className={styles.orbParticles}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={styles.particle} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>
      </div>

      {/* Text */}
      <div className={styles.textBlock}>
        <h2 className={styles.title}>
          Generando tu campaña
        </h2>
        <p className={styles.subtitle}>
          La IA está trabajando en tu campaña holográfica
        </p>
      </div>

      {/* Progress */}
      <div className={styles.progressWrapper}>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${generationProgress}%` }}
          />
        </div>
        <div className={styles.progressInfo}>
          <span className={styles.stepText}>
            {STEPS[currentStepIndex]?.icon} {generationMessage || STEPS[currentStepIndex]?.message}
          </span>
          <span className={styles.percentText}>{Math.round(generationProgress)}%</span>
        </div>
      </div>

      {/* Steps */}
      <div className={styles.stepsGrid}>
        {STEPS.map((step, i) => {
          const done = i < currentStepIndex;
          const active = i === currentStepIndex;
          return (
            <div
              key={step.id}
              className={`${styles.step} ${done ? styles.done : ''} ${active ? styles.active : ''}`}
            >
              <div className={styles.stepDot}>
                {done ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span>{step.id}</span>
                )}
              </div>
              <span className={styles.stepLabel}>{step.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
