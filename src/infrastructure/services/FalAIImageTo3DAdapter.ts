// Infrastructure: fal.ai Image-to-3D Adapter
// Uses fal.ai's Trellis model (best quality) or TripoSR (fastest)

import type { IImageTo3DRepository, ImageTo3DOptions, ImageTo3DResult } from '@domain/repositories';
import { fal } from '@fal-ai/client';

export class FalAIImageTo3DAdapter implements IImageTo3DRepository {
  constructor(private readonly apiKey: string) {
    // Configure fal client credentials
    fal.config({
      credentials: this.apiKey,
    });
  }

  async convert(imageUrl: string, options?: ImageTo3DOptions): Promise<ImageTo3DResult> {
    const isQuality = options?.quality === 'quality';
    const model = isQuality ? 'fal-ai/trellis' : 'fal-ai/triposr';

    let finalImageUrl = imageUrl;

    // fal.ai requires a public CDN URL. If the image is a base64 DataURL (uploaded locally),
    // convert it to a Blob and upload it to the fal.ai storage CDN first.
    if (imageUrl.startsWith('data:')) {
      try {
        const [header, base64Data] = imageUrl.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
        const buffer = Buffer.from(base64Data, 'base64');
        const blob = new Blob([buffer], { type: mimeType });
        
        console.log('Uploading local base64 image to fal.ai storage...');
        finalImageUrl = await fal.storage.upload(blob);
        console.log('Successfully uploaded to fal.ai CDN:', finalImageUrl);
      } catch (uploadError) {
        console.error('Failed to upload image to fal.ai CDN:', uploadError);
        throw new Error(`Failed to upload product image to fal.ai storage: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
      }
    }

    try {
      console.log(`Submitting image to fal.ai model ${model}...`);
      if (model === 'fal-ai/trellis') {
        let inputUrl = finalImageUrl;
        
        try {
          console.log('Running image through fal-ai/esrgan to upscale and sharpen texture details...');
          const upscaleResult = await fal.subscribe("fal-ai/esrgan", {
            input: {
              image_url: finalImageUrl,
            }
          }) as any;
          const upscaledUrl = upscaleResult.data?.image?.url ?? upscaleResult.image?.url;
          if (upscaledUrl) {
            inputUrl = upscaledUrl;
            console.log('Successfully upscaled image with Real-ESRGAN. New URL:', inputUrl);
          }
        } catch (upscaleError) {
          console.warn('Real-ESRGAN upscaling failed, falling back to original image:', upscaleError);
        }

        const result = await fal.subscribe(model, {
          input: {
            image_url: inputUrl,
            remove_bg: options?.removeBackground ?? true,
            ss_guidance_strength: 7.5,
            slat_guidance_strength: 3.0,
            ss_sampling_steps: 12,
            slat_sampling_steps: 12,
          } as any
        }) as any;

        console.log('fal.ai Trellis output:', result);
        return {
          modelUrl: result.data?.model_file?.url ?? result.model_file?.url ?? result.data?.model_mesh?.url ?? result.model_mesh?.url ?? '',
          texturedModelUrl: result.data?.model_file?.url ?? result.model_file?.url,
          previewImageUrl: result.data?.images?.[0]?.url ?? result.images?.[0]?.url,
          isMock: false,
        };
      } else {
        // triposr (fast default)
        const result = await fal.subscribe(model, {
          input: {
            image_url: finalImageUrl,
            remove_background: options?.removeBackground ?? true,
            foreground_ratio: 0.85,
          } as any
        }) as any;

        console.log('fal.ai TripoSR output:', result);
        return {
          modelUrl: result.data?.model_mesh?.url ?? result.model_mesh?.url ?? result.data?.model?.url ?? result.model?.url ?? '',
          previewImageUrl: result.data?.rendered_frames?.[0]?.url ?? result.rendered_frames?.[0]?.url,
          isMock: false,
        };
      }
    } catch (apiError) {
      console.error(`Error executing fal.ai model ${model}:`, apiError);
      throw new Error(`fal.ai 3D generation failed: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`);
    }
  }
}


