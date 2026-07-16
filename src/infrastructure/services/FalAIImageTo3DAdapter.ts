// Infrastructure: fal.ai Image-to-3D Adapter
// Uses fal.ai's Trellis 2 model (best quality) or TripoSR (fastest)

import type { IImageTo3DRepository, ImageTo3DOptions, ImageTo3DResult } from '@domain/repositories';
import { fal } from '@fal-ai/client';

// Trellis 2 quality knobs — directly trade off render fidelity against fal.ai generation time
// and per-render cost. Overridable via env without a redeploy. Trellis 2 splits guidance into
// three independent stages (structure / geometry refinement / texture) instead of the original
// Trellis's two, so texture fidelity to the source photo can be tuned on its own via
// tex_slat_guidance_strength — the key lever for not losing small print/logo detail.
// https://fal.ai/models/fal-ai/trellis-2/api
const TRELLIS_PARAMS = {
  ssGuidanceStrength: Number(process.env.FAL_TRELLIS_SS_GUIDANCE_STRENGTH) || 8.5,        // range 0-10, default 7.5
  shapeSlatGuidanceStrength: Number(process.env.FAL_TRELLIS_SHAPE_GUIDANCE_STRENGTH) || 8.0, // range 0-10, default 7.5
  // Default is only 1 — fal.ai keeps this low because pushing texture guidance too hard on the
  // *old* Trellis caused artifacts. We deliberately don't max this out at 10 for the same reason;
  // 6.0 is a meaningful push toward "stick to the photo's actual colors/detail" without the
  // documented artifact risk of the extreme end. Tune via env if you see banding/noise in testing.
  texSlatGuidanceStrength: Number(process.env.FAL_TRELLIS_TEX_GUIDANCE_STRENGTH) || 6.0,  // range 0-10, default 1
  ssSamplingSteps: Number(process.env.FAL_TRELLIS_SS_SAMPLING_STEPS) || 20,               // range 1-50, default 12
  shapeSlatSamplingSteps: Number(process.env.FAL_TRELLIS_SHAPE_SAMPLING_STEPS) || 20,     // range 1-50, default 12
  texSlatSamplingSteps: Number(process.env.FAL_TRELLIS_TEX_SAMPLING_STEPS) || 20,         // range 1-50, default 12
  textureSize: Number(process.env.FAL_TRELLIS_TEXTURE_SIZE) || 4096,                      // 1024 | 2048 | 4096
  resolution: Number(process.env.FAL_TRELLIS_RESOLUTION) || 1536,                          // 512 | 1024 | 1536
  // Absolute vertex count target (not a ratio like the old model's mesh_simplify). Default
  // 500k is already generous; we push it up for more retained geometric detail while staying
  // well under the 2M ceiling so the file stays practical to load/edit in Blender.
  decimationTarget: Number(process.env.FAL_TRELLIS_DECIMATION_TARGET) || 1_000_000,       // range 5,000-2,000,000
};
// Set to 'false' to skip running the input image(s) through fal-ai/esrgan before Trellis —
// sharpens fine texture detail the model picks up from the source photo, at the cost of a full
// extra model call per image (real wall-clock time). On by default for max fidelity.
const ENABLE_ESRGAN_PREPASS = process.env.FAL_TRELLIS_ENABLE_ESRGAN !== 'false';
const TRIPOSR_FOREGROUND_RATIO = Number(process.env.FAL_TRIPOSR_FOREGROUND_RATIO) || 0.85;

export class FalAIImageTo3DAdapter implements IImageTo3DRepository {
  constructor(private readonly apiKey: string) {
    // Configure fal client credentials
    fal.config({
      credentials: this.apiKey,
    });
  }

  private async ensurePublicUrl(imageUrl: string): Promise<string> {
    // fal.ai requires a public CDN URL. If the image is a base64 DataURL (uploaded locally),
    // convert it to a Blob and upload it to the fal.ai storage CDN first.
    if (!imageUrl.startsWith('data:')) return imageUrl;
    try {
      const [header, base64Data] = imageUrl.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
      const buffer = Buffer.from(base64Data, 'base64');
      const blob = new Blob([buffer], { type: mimeType });

      console.log('Uploading local base64 image to fal.ai storage...');
      const uploadedUrl = await fal.storage.upload(blob);
      console.log('Successfully uploaded to fal.ai CDN:', uploadedUrl);
      return uploadedUrl;
    } catch (uploadError) {
      console.error('Failed to upload image to fal.ai CDN:', uploadError);
      throw new Error(`Failed to upload product image to fal.ai storage: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
    }
  }

  private async esrganSharpen(imageUrl: string): Promise<string> {
    try {
      console.log('Running image through fal-ai/esrgan to upscale and sharpen texture details...');
      const upscaleResult = await fal.subscribe("fal-ai/esrgan", {
        input: { image_url: imageUrl }
      }) as any;
      const upscaledUrl = upscaleResult.data?.image?.url ?? upscaleResult.image?.url;
      if (upscaledUrl) {
        console.log('Successfully upscaled image with Real-ESRGAN. New URL:', upscaledUrl);
        return upscaledUrl;
      }
      return imageUrl;
    } catch (upscaleError) {
      console.warn('Real-ESRGAN upscaling failed, falling back to original image:', upscaleError);
      return imageUrl;
    }
  }

  async convert(imageUrls: string[], options?: ImageTo3DOptions): Promise<ImageTo3DResult> {
    const isQuality = options?.quality === 'quality';
    const isMultiImage = isQuality && imageUrls.length > 1;
    const model = isQuality ? (isMultiImage ? 'fal-ai/trellis-2/multi' : 'fal-ai/trellis-2') : 'fal-ai/triposr';

    const publicUrls = await Promise.all(imageUrls.map((u) => this.ensurePublicUrl(u)));

    try {
      console.log(`Submitting ${publicUrls.length} image(s) to fal.ai model ${model}...`);
      if (model === 'fal-ai/trellis-2' || model === 'fal-ai/trellis-2/multi') {
        const inputUrls = ENABLE_ESRGAN_PREPASS
          ? await Promise.all(publicUrls.map((u) => this.esrganSharpen(u)))
          : publicUrls;

        const sharedParams = {
          remove_bg: options?.removeBackground ?? true,
          resolution: TRELLIS_PARAMS.resolution,
          ss_guidance_strength: TRELLIS_PARAMS.ssGuidanceStrength,
          ss_sampling_steps: TRELLIS_PARAMS.ssSamplingSteps,
          shape_slat_guidance_strength: TRELLIS_PARAMS.shapeSlatGuidanceStrength,
          shape_slat_sampling_steps: TRELLIS_PARAMS.shapeSlatSamplingSteps,
          tex_slat_guidance_strength: TRELLIS_PARAMS.texSlatGuidanceStrength,
          tex_slat_sampling_steps: TRELLIS_PARAMS.texSlatSamplingSteps,
          texture_size: TRELLIS_PARAMS.textureSize,
          decimation_target: TRELLIS_PARAMS.decimationTarget,
          remesh: true,
        };

        const result = await fal.subscribe(model, {
          input: isMultiImage
            ? { image_urls: inputUrls, ...sharedParams }
            : { image_url: inputUrls[0], ...sharedParams }
        } as any) as any;

        console.log('fal.ai Trellis 2 output:', result);
        return {
          modelUrl: result.data?.model_glb?.url ?? result.model_glb?.url ?? '',
          texturedModelUrl: result.data?.model_glb?.url ?? result.model_glb?.url,
          isMock: false,
        };
      } else {
        // triposr (fast default) — single-image only, uses the first uploaded photo
        const result = await fal.subscribe(model, {
          input: {
            image_url: publicUrls[0],
            remove_background: options?.removeBackground ?? true,
            foreground_ratio: TRIPOSR_FOREGROUND_RATIO,
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


