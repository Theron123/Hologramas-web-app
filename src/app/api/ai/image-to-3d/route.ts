import { NextRequest, NextResponse } from 'next/server';
import { GenerateHologramUseCase } from '@application/use-cases/GenerateHologramUseCase';
import { FalAIImageTo3DAdapter } from '@infrastructure/services/FalAIImageTo3DAdapter';
import { MockImageTo3DAdapter } from '@infrastructure/services/MockAIServices';
import { GradioImageTo3DAdapter } from '@infrastructure/services/GradioImageTo3DAdapter';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { imageUrl: string; productName?: string; quality?: 'fast' | 'quality'; forceMock?: boolean };
    const { imageUrl, productName = '', quality = 'fast', forceMock = false } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    }

    // Use real fal.ai adapter if API key is active, or use free Gradio client, or use mock in demo mode.
    // FAL_KEY_DISABLED_PREFIXES lets us treat known placeholder/expired demo keys (e.g. ones baked
    // into a starter template) as "not configured" instead of sending real requests that would just
    // fail with an auth error. Comma-separated; defaults cover the known placeholder values.
    const falKey = process.env.FAL_KEY;
    const disabledFalKeyPrefixes = (process.env.FAL_KEY_DISABLED_PREFIXES || 'locked,f54465d8-')
      .split(',')
      .map((prefix) => prefix.trim())
      .filter(Boolean);
    const isFalKeyActive =
      !!falKey && !disabledFalKeyPrefixes.some((prefix) => falKey === prefix || falKey.startsWith(prefix));

    let repo;
    if (forceMock) {
      console.log('Using Mock 3D adapter (Modo Demo)...');
      repo = new MockImageTo3DAdapter();
    } else if (isFalKeyActive) {
      console.log('Using active fal.ai 3D adapter...');
      repo = new FalAIImageTo3DAdapter(falKey!);
    } else {
      console.log('Using free keyless Gradio 3D adapter...');
      repo = new GradioImageTo3DAdapter();
    }

    const useCase = new GenerateHologramUseCase(repo);

    const result = await useCase.execute({
      imageUrl,
      productName,
      options: {
        quality,
        removeBackground: true,
      },
    });

    return NextResponse.json({
      success: true,
      modelUrl: result.modelUrl,
      texturedModelUrl: result.texturedModelUrl,
      previewImageUrl: result.previewImageUrl,
      isMock: result.isMock,
    });
  } catch (error) {
    console.error('Image-to-3D error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Image-to-3D generation failed' },
      { status: 500 },
    );
  }
}

// This route can take up to 120 seconds (3D generation is slow)
export const maxDuration = 120;
