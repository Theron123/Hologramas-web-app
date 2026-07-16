// Application Layer: GenerateHologramUseCase
// Converts a product image into a 3D holographic model using AI

import type { IImageTo3DRepository, ImageTo3DOptions, ImageTo3DResult } from '@domain/repositories';

export interface GenerateHologramCommand {
  /** Base64 data URL(s) or publicly accessible URL(s) of the product image — multiple angles
   * of the same product improve reconstruction quality when the underlying provider supports it. */
  imageUrls: string[];
  /** Optional: upload the image to a temporary CDN first (needed for data: URLs) */
  productName?: string;
  options?: ImageTo3DOptions;
}

export interface GenerateHologramResult {
  /** URL of the .glb 3D model ready to load in Three.js */
  modelUrl: string;
  texturedModelUrl?: string;
  previewImageUrl?: string;
  isMock: boolean;
}

export class GenerateHologramUseCase {
  constructor(private readonly imageTo3DRepo: IImageTo3DRepository) {}

  async execute(command: GenerateHologramCommand): Promise<GenerateHologramResult> {
    const result: ImageTo3DResult = await this.imageTo3DRepo.convert(command.imageUrls, {
      quality: command.options?.quality ?? 'fast',
      removeBackground: command.options?.removeBackground ?? true,
      productName: command.productName,
    });

    return {
      modelUrl: result.modelUrl,
      texturedModelUrl: result.texturedModelUrl,
      previewImageUrl: result.previewImageUrl,
      isMock: result.isMock ?? false,
    };
  }
}
