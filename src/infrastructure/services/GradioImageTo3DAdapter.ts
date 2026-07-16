import type { IImageTo3DRepository, ImageTo3DOptions, ImageTo3DResult } from '@domain/repositories';
import { Client, handle_file } from '@gradio/client';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Public, free Hugging Face Spaces used as a keyless fallback when no FAL_KEY is configured.
// Overridable via env in case these Spaces get renamed, rate-limited, or deprecated.
const TRELLIS_SPACE = process.env.GRADIO_TRELLIS_SPACE || 'microsoft/TRELLIS.2';
const TRIPOSR_SPACE = process.env.GRADIO_TRIPOSR_SPACE || 'stabilityai/TripoSR';

// Free HF Spaces queue times vary a lot depending on load. This multiplier scales every
// step timeout below without needing a separate env var per step.
const TIMEOUT_MULTIPLIER = Number(process.env.GRADIO_TIMEOUT_MULTIPLIER) || 1;

function scaledTimeout(ms: number): number {
  return Math.round(ms * TIMEOUT_MULTIPLIER);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export class GradioImageTo3DAdapter implements IImageTo3DRepository {
  private readonly hfToken: string | undefined;

  constructor() {
    this.hfToken = process.env.HF_TOKEN;
  }

  async convert(imageUrls: string[], options?: ImageTo3DOptions): Promise<ImageTo3DResult> {
    // These free HF Spaces only accept a single image; multi-angle uploads only benefit the
    // fal.ai path (FalAIImageTo3DAdapter), so we just use the first photo here.
    const imageUrl = imageUrls[0];
    console.log(`GradioImageTo3DAdapter: Starting 3D model generation on ${TRELLIS_SPACE}...`);

    let localTempPath: string | null = null;
    let fileInput: any;

    try {
      // Use the OS temp dir (not a project-relative folder) so this also works on serverless
      // hosts like Vercel, where the filesystem is read-only outside of os.tmpdir().
      const scratchDir = path.join(os.tmpdir(), 'holoforge-scratch');
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
      }

      // Generate unique temp path
      localTempPath = path.join(scratchDir, `temp_upload_${Date.now()}.png`);

      // 1. Download and save the image locally to ensure bulletproof Gradio uploading
      if (imageUrl.startsWith('data:')) {
        const [header, base64Data] = imageUrl.split(',');
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(localTempPath, buffer);
        console.log('GradioImageTo3DAdapter: Saved base64 image locally');
      } else {
        console.log(`GradioImageTo3DAdapter: Downloading remote image locally: ${imageUrl}`);
        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(localTempPath, buffer);
      }

      fileInput = handle_file(localTempPath);
      const connectOptions = this.hfToken && this.hfToken.startsWith('hf_')
        ? { token: this.hfToken as `hf_${string}` }
        : {};

      // 2. Try TRELLIS.2 first (high quality, textured mesh)
      try {
        console.log(`GradioImageTo3DAdapter: Connecting to ${TRELLIS_SPACE}...`);
        const app = await withTimeout(
          Client.connect(TRELLIS_SPACE, connectOptions),
          scaledTimeout(15000),
          'TRELLIS.2 Connect'
        );
        console.log(`GradioImageTo3DAdapter: Connected to ${TRELLIS_SPACE} successfully.`);

        // Step 1: Preprocess Image
        console.log('GradioImageTo3DAdapter: Preprocessing image on TRELLIS.2...');
        const preprocessResult = await withTimeout(
          app.predict('/preprocess_image', [fileInput]),
          scaledTimeout(12000),
          'TRELLIS.2 Preprocess'
        ) as any;
        const preprocessedImg = preprocessResult?.data?.[0];
        if (!preprocessedImg) {
          throw new Error('TRELLIS.2 preprocessing step failed');
        }

        // Step 2: Image to 3D (generates Gaussian representation/session state)
        console.log('GradioImageTo3DAdapter: Generating 3D representation on TRELLIS.2...');
        const imageTo3DResult = await withTimeout(
          app.predict('/image_to_3d', [
            preprocessedImg, // 1. preprocessedImg
            0,               // 2. seed
            '1024',          // 3. resolution
            7.5,             // 4. ss_guidance_strength
            0.7,             // 5. ss_guidance_rescale
            12,              // 6. ss_sampling_steps
            5,               // 7. ss_rescale_t
            7.5,             // 8. shape_slat_guidance_strength
            0.5,             // 9. shape_slat_guidance_rescale
            12,              // 10. shape_slat_sampling_steps
            3,               // 11. shape_slat_rescale_t
            1,               // 12. tex_slat_guidance_strength
            0,               // 13. tex_slat_guidance_rescale
            12,              // 14. tex_slat_sampling_steps
            3                // 15. tex_slat_rescale_t
          ]),
          scaledTimeout(50000),
          'TRELLIS.2 ImageTo3D'
        ) as any;

        // Step 3: Extract GLB (downloads 3D mesh)
        console.log('GradioImageTo3DAdapter: Extracting GLB mesh from TRELLIS.2...');
        const extractGlbResult = await withTimeout(
          app.predict('/extract_glb', [
            null,            // 1. state (retrieved from Gradio session)
            100000,          // 2. decimation_target (100k for optimal loading performance)
            1024             // 3. texture_size
          ]),
          scaledTimeout(40000),
          'TRELLIS.2 ExtractGLB'
        ) as any;

        const glbFile = extractGlbResult?.data?.[0] || extractGlbResult?.data?.[1];

        if (glbFile && glbFile.url) {
          console.log('GradioImageTo3DAdapter: TRELLIS.2 generation succeeded! GLB URL:', glbFile.url);
          return {
            modelUrl: glbFile.url,
            texturedModelUrl: glbFile.url,
            isMock: false,
          };
        }
        throw new Error('TRELLIS.2 did not return a valid GLB file URL');
      } catch (trellisError) {
        console.warn('GradioImageTo3DAdapter: TRELLIS.2 generation failed, falling back to TripoSR. Error:', 
          trellisError instanceof Error ? trellisError.message : String(trellisError)
        );

        // 3. Fallback to TripoSR (fast, mesh-only fallback)
        try {
          console.log(`GradioImageTo3DAdapter: Connecting to ${TRIPOSR_SPACE}...`);
          const app = await withTimeout(
            Client.connect(TRIPOSR_SPACE, connectOptions),
            scaledTimeout(12000),
            'TripoSR Connect'
          );
          console.log('GradioImageTo3DAdapter: Connected to TripoSR successfully.');

          console.log('GradioImageTo3DAdapter: Preprocessing image on TripoSR...');
          const preprocessResult = await withTimeout(
            app.predict('/preprocess', [
              fileInput,
              options?.removeBackground ?? true,
              0.85
            ]),
            scaledTimeout(12000),
            'TripoSR Preprocess'
          ) as any;

          const processedImg = preprocessResult?.data?.[0];
          if (!processedImg) {
            throw new Error('TripoSR preprocess step failed');
          }

          console.log('GradioImageTo3DAdapter: Generating 3D mesh on TripoSR...');
          const generateResult = await withTimeout(
            app.predict('/generate', [
              processedImg,
              64 // resolution
            ]),
            scaledTimeout(20000),
            'TripoSR Generate'
          ) as any;

          const glbFile = generateResult?.data?.[1];

          if (glbFile && glbFile.url) {
            console.log('GradioImageTo3DAdapter: TripoSR generation succeeded! GLB:', glbFile.url);
            return {
              modelUrl: glbFile.url,
              previewImageUrl: processedImg.url,
              isMock: false,
            };
          }
          throw new Error('TripoSR did not return a valid GLB file URL');
        } catch (triposrError) {
          console.error('GradioImageTo3DAdapter: TripoSR fallback failed too:', triposrError);
          throw new Error(`All 3D generation channels failed. TRELLIS.2: ${trellisError instanceof Error ? trellisError.message : String(trellisError)}. TripoSR: ${triposrError instanceof Error ? triposrError.message : String(triposrError)}`);
        }
      }
    } finally {
      // Ensure local temp file cleanup
      if (localTempPath && fs.existsSync(localTempPath)) {
        try {
          fs.unlinkSync(localTempPath);
          console.log(`GradioImageTo3DAdapter: Cleaned up local temp file: ${localTempPath}`);
        } catch (cleanupError) {
          console.warn('GradioImageTo3DAdapter: Error deleting temp file:', cleanupError);
        }
      }
    }
  }
}
