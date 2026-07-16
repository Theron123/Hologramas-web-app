import { NextRequest, NextResponse } from 'next/server';
import { GenerateCampaignUseCase } from '@application/use-cases/GenerateCampaignUseCase';
import { MockVisionRepository, MockCopyGenerationRepository } from '@infrastructure/services/MockAIServices';
import { OpenAIVisionAdapter, OpenAICopyGenerationAdapter } from '@infrastructure/services/OpenAIAIServices';
import { GeminiVisionAdapter, GeminiCopyGenerationAdapter } from '@infrastructure/services/GeminiAIServices';
import { getCampaignRepository, getProductRepository } from '@infrastructure/repositories/InMemoryRepositories';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productName, images, campaignName, forceMock = false } = body;

    if (!productName || !images || images.length === 0) {
      return NextResponse.json({ error: 'productName and images are required' }, { status: 400 });
    }

    // Dynamic selection of AI repository providers
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    
    let visionRepo;
    let copyRepo;
    // Which provider we *intended* to use, so we can tell a deliberate demo/mock request
    // apart from a real provider silently failing and falling back to Mock below.
    let attemptedProvider: 'gemini' | 'openai' | null = null;
    let provider: 'gemini' | 'openai' | 'mock';

    if (geminiKey && !forceMock) {
      console.log('Using Gemini API for product analysis & copywriting...');
      attemptedProvider = 'gemini';
      provider = 'gemini';
      visionRepo = new GeminiVisionAdapter(geminiKey);
      copyRepo = new GeminiCopyGenerationAdapter(geminiKey);
    } else if (openaiKey && !forceMock) {
      console.log('Using OpenAI API for product analysis & copywriting...');
      attemptedProvider = 'openai';
      provider = 'openai';
      visionRepo = new OpenAIVisionAdapter(openaiKey);
      copyRepo = new OpenAICopyGenerationAdapter(openaiKey);
    } else {
      console.log('Using Mock simulator for product analysis & copywriting...');
      provider = 'mock';
      visionRepo = new MockVisionRepository();
      copyRepo = new MockCopyGenerationRepository();
    }

    const campaignRepo = getCampaignRepository();
    const productRepo = getProductRepository();

    let useCase = new GenerateCampaignUseCase(visionRepo, copyRepo, campaignRepo, productRepo);
    let result;
    let fallbackReason: string | null = null;
    try {
      result = await useCase.execute({ productName, images, campaignName });
    } catch (apiError) {
      console.warn('AI Campaign generation failed. Falling back to Mock simulation. Error:', apiError);
      // Only surface this as a "fallback" if a real provider was actually attempted — if we were
      // already deliberately on Mock (forceMock or no keys), a failure here isn't a fallback.
      if (attemptedProvider) {
        fallbackReason = apiError instanceof Error ? apiError.message : 'Error desconocido de la IA';
      }
      provider = 'mock';
      const { MockVisionRepository, MockCopyGenerationRepository } = await import('@infrastructure/services/MockAIServices');
      const mockVision = new MockVisionRepository();
      const mockCopy = new MockCopyGenerationRepository();
      useCase = new GenerateCampaignUseCase(mockVision, mockCopy, campaignRepo, productRepo);
      result = await useCase.execute({ productName, images, campaignName });
    }


    // Serialize — convert class instances to plain objects
    return NextResponse.json({
      success: true,
      provider,
      isMockFallback: fallbackReason !== null,
      fallbackReason,
      campaign: {
        id: result.campaign.id,
        name: result.campaign.name,
        productName: result.campaign.productName,
        productDescription: result.campaign.productDescription,
        targetAudience: result.campaign.targetAudience,
        status: result.campaign.status,
        adCopyVariants: result.campaign.adCopyVariants,
        theme: result.campaign.theme,
        createdAt: result.campaign.createdAt.toISOString(),
        updatedAt: result.campaign.updatedAt.toISOString(),
      },
      product: {
        id: result.product.id,
        name: result.product.name,
        description: result.product.description,
        images: result.product.images,
        aiAnalysis: result.product.aiAnalysis,
      },
    });
  } catch (error) {
    console.error('Campaign generation error:', error);
    return NextResponse.json({ error: 'Campaign generation failed' }, { status: 500 });
  }
}

