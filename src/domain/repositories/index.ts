// Domain Repositories: Interfaces (Ports)
// These are pure interfaces — no implementation details here

import type { Campaign } from '../entities/Campaign';
import type { Product, ProductAnalysis } from '../entities/Product';
import type { AdCopyVariant } from '../entities/Campaign';

// ────────────────────────────────────────────────
// Campaign Repository
// ────────────────────────────────────────────────
export interface ICampaignRepository {
  findById(id: string): Promise<Campaign | null>;
  findAll(): Promise<Campaign[]>;
  save(campaign: Campaign): Promise<Campaign>;
  update(campaign: Campaign): Promise<Campaign>;
  delete(id: string): Promise<void>;
}

// ────────────────────────────────────────────────
// Product Repository
// ────────────────────────────────────────────────
export interface IProductRepository {
  findById(id: string): Promise<Product | null>;
  save(product: Product): Promise<Product>;
  update(product: Product): Promise<Product>;
}

// ────────────────────────────────────────────────
// AI Vision Repository (Port for GPT-4o)
// ────────────────────────────────────────────────
export interface IVisionRepository {
  analyzeProduct(imageUrls: string[], productName?: string): Promise<ProductAnalysis>;
}

// ────────────────────────────────────────────────
// AI Copy Generation Repository
// ────────────────────────────────────────────────
export interface ICopyGenerationRepository {
  generateAdCopy(analysis: ProductAnalysis, productName: string): Promise<AdCopyVariant[]>;
}

// ────────────────────────────────────────────────
// Image → 3D Repository (Port for fal.ai Trellis/TripoSR)
// ────────────────────────────────────────────────
export interface IImageTo3DRepository {
  /**
   * Convert one or more 2D image URLs (multiple angles of the same product, when available)
   * into a 3D model. Returns the URL of the generated .glb file.
   */
  convert(imageUrls: string[], options?: ImageTo3DOptions): Promise<ImageTo3DResult>;
}

export interface ImageTo3DOptions {
  /**
   * Quality preset: 'fast' (~15s) or 'quality' (~40s)
   */
  quality?: 'fast' | 'quality';
  /** Remove background before processing */
  removeBackground?: boolean;
  /** Name of the product to help mock AI map to high-quality category models */
  productName?: string;
}

export interface ImageTo3DResult {
  /** URL of the generated .glb 3D model */
  modelUrl: string;
  /** URL of the generated .glb with textures (if available) */
  texturedModelUrl?: string;
  /** Preview render image of the 3D model */
  previewImageUrl?: string;
  /** Whether this is a mock result */
  isMock?: boolean;
}

// ────────────────────────────────────────────────
// Image Generation (style transfer, background removal)
// ────────────────────────────────────────────────
export interface IImageProcessingRepository {
  removeBackground(imageUrl: string): Promise<string>;
  enhanceImage(imageUrl: string): Promise<string>;
}
