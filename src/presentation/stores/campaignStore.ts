// Global state store using Zustand
'use client';

import { create } from 'zustand';
import type { Campaign, CampaignTheme, AdCopyVariant } from '@domain/entities/Campaign';
import type { Product } from '@domain/entities/Product';

export type AppStep = 'upload' | 'generating' | 'editor' | 'preview';

export interface UploadedImage {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
}

interface HologramSettings {
  rotationSpeed: number;
  glowIntensity: number;
  scanlineOpacity: number;
  particleCount: number;
  bloomStrength: number;
  chromaticAberration: number;
  hologramMode: 'textured' | 'neon' | 'wireframe';
}

interface CampaignStore {
  // Current step
  currentStep: AppStep;
  setStep: (step: AppStep) => void;

  // Upload state
  uploadedImages: UploadedImage[];
  productName: string;
  setUploadedImages: (images: UploadedImage[]) => void;
  addUploadedImage: (image: UploadedImage) => void;
  removeUploadedImage: (id: string) => void;
  setProductName: (name: string) => void;

  // Generation state
  isGenerating: boolean;
  generationProgress: number;
  generationMessage: string;
  setGenerating: (v: boolean) => void;
  setGenerationProgress: (progress: number, message: string) => void;

  // Campaign data
  currentCampaign: Campaign | null;
  currentProduct: Product | null;
  setCampaign: (campaign: Campaign) => void;
  setProduct: (product: Product) => void;
  updateCampaignTheme: (theme: CampaignTheme) => void;
  updateAdCopy: (variants: AdCopyVariant[]) => void;

  // Set when the real AI provider (Gemini/OpenAI) failed and we silently fell back to the
  // Mock simulator, so the UI can warn the user instead of presenting mock copy as if it were real.
  campaignFallbackReason: string | null;
  setCampaignFallbackReason: (reason: string | null) => void;

  // 3D Model
  model3DUrl: string | null;
  aiModel3DUrl: string | null;
  isMockModel: boolean;
  isGenerating3D: boolean;
  setModel3D: (url: string, isMock: boolean) => void;
  setAIModel3D: (url: string) => void;
  setGenerating3D: (v: boolean) => void;
  productColor: string;
  setProductColor: (color: string) => void;

  // Hologram settings
  hologramSettings: HologramSettings;
  updateHologramSettings: (settings: Partial<HologramSettings>) => void;

  // Active copy variant
  activeVariantIndex: number;
  setActiveVariant: (index: number) => void;

  // Reset
  reset: () => void;
}

const defaultHologramSettings: HologramSettings = {
  rotationSpeed: 0.5,
  glowIntensity: 1.2,
  scanlineOpacity: 0.3,
  particleCount: 150,
  bloomStrength: 1.5,
  chromaticAberration: 0.002,
  hologramMode: 'textured',
};

export const useCampaignStore = create<CampaignStore>((set, get) => ({
  currentStep: 'upload',
  setStep: (step) => set({ currentStep: step }),

  uploadedImages: [],
  productName: '',
  setUploadedImages: (images) => set({ uploadedImages: images }),
  addUploadedImage: (image) => set((s) => ({ uploadedImages: [...s.uploadedImages, image] })),
  removeUploadedImage: (id) => set((s) => ({ uploadedImages: s.uploadedImages.filter((i) => i.id !== id) })),
  setProductName: (name) => set({ productName: name }),

  isGenerating: false,
  generationProgress: 0,
  generationMessage: '',
  setGenerating: (v) => set({ isGenerating: v }),
  setGenerationProgress: (progress, message) => set({ generationProgress: progress, generationMessage: message }),

  currentCampaign: null,
  currentProduct: null,
  setCampaign: (campaign) => set({ currentCampaign: campaign }),
  setProduct: (product) => set({ currentProduct: product }),

  updateCampaignTheme: (theme) => {
    const { currentCampaign } = get();
    if (currentCampaign) {
      set({ currentCampaign: currentCampaign.withTheme(theme) });
    }
  },

  updateAdCopy: (variants) => {
    const { currentCampaign } = get();
    if (currentCampaign) {
      set({ currentCampaign: currentCampaign.withAdCopy(variants) });
    }
  },

  campaignFallbackReason: null,
  setCampaignFallbackReason: (reason) => set({ campaignFallbackReason: reason }),

  model3DUrl: null,
  aiModel3DUrl: null,
  isMockModel: false,
  isGenerating3D: false,
  setModel3D: (url, isMock) => set({ model3DUrl: url, isMockModel: isMock }),
  setAIModel3D: (url) => set({ aiModel3DUrl: url }),
  setGenerating3D: (v) => set({ isGenerating3D: v }),
  productColor: '',
  setProductColor: (color) => set({ productColor: color }),

  hologramSettings: defaultHologramSettings,
  updateHologramSettings: (settings) =>
    set((s) => ({ hologramSettings: { ...s.hologramSettings, ...settings } })),

  activeVariantIndex: 0,
  setActiveVariant: (index) => set({ activeVariantIndex: index }),

  reset: () =>
    set({
      currentStep: 'upload',
      uploadedImages: [],
      productName: '',
      isGenerating: false,
      generationProgress: 0,
      generationMessage: '',
      currentCampaign: null,
      currentProduct: null,
      model3DUrl: null,
      aiModel3DUrl: null,
      isMockModel: false,
      isGenerating3D: false,
      productColor: '',
      hologramSettings: defaultHologramSettings,
      activeVariantIndex: 0,
      campaignFallbackReason: null,
    }),
}));
