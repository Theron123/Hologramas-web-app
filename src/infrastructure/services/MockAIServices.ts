// Infrastructure: Mock Image-to-3D Adapter
// Returns a REAL .glb file from a public sample library
// so the 3D viewer always has something interesting to show
// without requiring a fal.ai API key

import type { IImageTo3DRepository, ImageTo3DOptions, ImageTo3DResult } from '@domain/repositories';

// Category -> demo GLB lookup for Mock 3D generation. All URLs point at third-party-hosted
// sample assets (threejs.org, modelviewer.dev, KhronosGroup's sample repo on GitHub) — none of
// these are under our control, so if one goes offline the affected category silently falls back
// to the 2.5D point-cloud projection of the uploaded photo (handled by HologramViewer's
// ModelErrorBoundary), not a hard crash. Centralized here as one table instead of scattered
// if-blocks so updating/replacing an entry only requires touching one line.
const MOCK_MODEL_CATEGORIES: Array<{ pattern: RegExp; url: string }> = [
  {
    pattern: /\b(car|carro|auto|coche|vehiculo|ferrari|tesla|bmw|ford|toyota|moto|truck|bentley|porsche|audi|mercedes|lamborghini|aston|bugatti|mclaren|chevrolet|nissan|dodge|mustang|suv|racing|racecar)\b/i,
    url: 'https://threejs.org/examples/models/gltf/ferrari.glb',
  },
  {
    pattern: /\b(audifono|auricular|audio|parlante|bocina|musica|boombox|speaker|headphone|sound|soundbar)\b/i,
    url: 'https://threejs.org/examples/models/gltf/BoomBox.glb',
  },
  {
    pattern: /\b(silla|mueble|chair|furniture|butaca|sofa|mesa|desk)\b/i,
    url: 'https://threejs.org/examples/models/gltf/SheenChair.glb',
  },
  {
    pattern: /\b(zapato|tenis|shoe|sneaker|bota|running|calzado)\b/i,
    url: 'https://modelviewer.dev/shared-assets/models/glTF-Sample-Models/2.0/MaterialsVariantsShoe/glTF-Binary/MaterialsVariantsShoe.glb',
  },
  {
    pattern: /\b(aguacate|avocado|comida|fruta|vegetal|food|fruit)\b/i,
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb',
  },
  {
    pattern: /\b(robot|ia|ai|androide|tecnologia|tech|processor|chip)\b/i,
    url: 'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
  },
];

export class MockImageTo3DAdapter implements IImageTo3DRepository {
  async convert(imageUrl: string, options?: ImageTo3DOptions): Promise<ImageTo3DResult> {
    // Simulate processing time (fast quality ~3s, full quality ~6s)
    const delay = options?.quality === 'quality' ? 6000 : 3000;
    await new Promise((r) => setTimeout(r, delay));

    const name = (options?.productName || '').toLowerCase().trim();

    const match = MOCK_MODEL_CATEGORIES.find((category) => category.pattern.test(name));
    if (match) {
      return { modelUrl: match.url, isMock: true };
    }

    // Default fallback: project the actual uploaded image URL as a 2.5D hologram
    return {
      modelUrl: imageUrl,
      isMock: true,
    };
  }
}

// ────────────────────────────────────────────────
// Mock Vision Repository (simulates GPT-4o)
// ────────────────────────────────────────────────
import type { IVisionRepository, ICopyGenerationRepository } from '@domain/repositories';
import type { ProductAnalysis } from '@domain/entities/Product';
import type { AdCopyVariant } from '@domain/entities/Campaign';

export class MockVisionRepository implements IVisionRepository {
  async analyzeProduct(_imageUrls: string[], productName?: string): Promise<ProductAnalysis> {
    await new Promise((r) => setTimeout(r, 1200));
    return {
      productType: 'Premium Consumer Product',
      colors: ['#1a1a2e', '#16213e', '#0f3460', '#e94560'],
      mood: 'Futuristic, Premium, Innovative',
      targetAudience: 'Tech-savvy millennials and Gen Z professionals aged 25-40',
      keyFeatures: [
        'Cutting-edge design',
        'Premium materials',
        'Innovative technology',
        'Sustainable manufacturing',
        'Exceptional user experience',
      ],
      suggestedTaglines: [
        `${productName ?? 'Your Product'} — Beyond the Ordinary`,
        'The Future Is Now',
        "Redefine What's Possible",
        `Experience ${productName ?? 'Innovation'} Like Never Before`,
      ],
      campaignTheme: 'Futuristic luxury meets accessible innovation',
      emotionalTone: 'Aspirational, confident, forward-thinking',
      marketingAngle:
        'Position as the definitive choice for those who demand more from their world',
    };
  }
}

export class MockCopyGenerationRepository implements ICopyGenerationRepository {
  async generateAdCopy(analysis: ProductAnalysis, productName: string): Promise<AdCopyVariant[]> {
    await new Promise((r) => setTimeout(r, 800));
    return [
      {
        headline: `The Future of ${productName}`,
        tagline: 'Beyond the ordinary. Beyond the possible.',
        body: `Introducing ${productName} — where cutting-edge innovation meets uncompromising design. Every detail engineered for those who refuse to settle. This isn't just a product. It's a statement.`,
        cta: 'Discover the Future',
        hashtags: [
          `#${productName.replace(/\s/g, '')}`,
          '#Innovation',
          '#FutureNow',
          '#Premium',
          '#NextLevel',
        ],
        platform: 'instagram',
      },
      {
        headline: `${productName}: Redefining Excellence`,
        tagline: 'Innovation that speaks for itself.',
        body: `In a world of compromises, ${productName} stands apart. Engineered for ${analysis.targetAudience}, crafted with ${analysis.keyFeatures.slice(0, 2).join(' and ')}, and designed to outlast every trend. The question isn't if you're ready for it — it's whether you can afford not to be.`,
        cta: 'Experience Excellence',
        hashtags: [
          `#${productName.replace(/\s/g, '')}`,
          '#PremiumQuality',
          '#DesignExcellence',
          '#Innovation',
        ],
        platform: 'linkedin',
      },
      {
        headline: `Transform Your World with ${productName}`,
        tagline: 'Because extraordinary people deserve extraordinary things.',
        body: `${analysis.emotionalTone}. ${productName} was built for you — the visionary who sees possibilities where others see limits. Join thousands who've already made the leap.`,
        cta: 'Join the Movement',
        hashtags: [
          `#${productName.replace(/\s/g, '')}`,
          '#GameChanger',
          '#JoinTheMovement',
          '#Bold',
        ],
        platform: 'tiktok',
      },
      {
        headline: productName.toUpperCase(),
        tagline: analysis.suggestedTaglines[0] ?? 'The Next Generation',
        body: `${analysis.marketingAngle}. ${productName} — available now.`,
        cta: 'Get Yours',
        hashtags: [],
        platform: 'ooh',
      },
    ];
  }
}
