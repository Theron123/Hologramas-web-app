import OpenAI from 'openai';
import type { IVisionRepository, ICopyGenerationRepository } from '@domain/repositories';
import type { ProductAnalysis } from '@domain/entities/Product';
import type { AdCopyVariant, AdPlatform } from '@domain/entities/Campaign';

// Overridable via env so a model deprecation/rename doesn't require a code change + redeploy.
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

export class OpenAIVisionAdapter implements IVisionRepository {
  private readonly openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async analyzeProduct(imageUrls: string[], productName?: string): Promise<ProductAnalysis> {
    if (imageUrls.length === 0) {
      throw new Error('At least one image is required for product analysis');
    }

    const primaryImage = imageUrls[0];
    const nameHint = productName ? `(The user suggests the name is "${productName}")` : '';

    const systemPrompt = `You are an expert marketing strategist and product designer.
Analyze the product image provided by the user. Identify the exact product category, shape, colors, materials, target audience, emotional tone, and key features.
Provide a clean JSON response matching this TypeScript schema:
{
  "productType": "Detailed name/category of the product (e.g. 'Air Jordan 1 Retro Sneaker', 'Red Rose Flower', 'Luxury Leather Watch')",
  "colors": ["list of 3 to 4 dominant hex colors found on the product, starting with the most prominent"],
  "mood": "3 descriptive words of the product's mood (e.g. 'premium, energetic, classic')",
  "targetAudience": "Specific description of who would buy this product",
  "keyFeatures": ["3 key visual or functional features of the product shown in the image"],
  "suggestedTaglines": ["3 high-impact marketing taglines for this product"],
  "campaignTheme": "A concise creative theme direction (e.g. 'Retro luxury meets modern comfort')",
  "emotionalTone": "The emotional feeling (e.g. 'Aspirational and sleek')",
  "marketingAngle": "How to position this product to stand out in the market"
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Please analyze this product ${nameHint}. Return only the JSON object.` },
              {
                type: 'image_url',
                image_url: {
                  url: primaryImage, // GPT-4o Vision natively accepts both public HTTP URLs and base64 DataURLs!
                },
              },
            ],
          },
        ],
      });

      const jsonText = response.choices[0]?.message?.content || '{}';
      return JSON.parse(jsonText) as ProductAnalysis;
    } catch (error) {
      console.error('Error in OpenAIVisionAdapter:', error);
      throw new Error(`OpenAI Vision analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export class OpenAICopyGenerationAdapter implements ICopyGenerationRepository {
  private readonly openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async generateAdCopy(analysis: ProductAnalysis, productName: string): Promise<AdCopyVariant[]> {
    const systemPrompt = `You are a high-performing conversion copywriter.
Based on the following product analysis, write 4 distinct copy variants tailored to specific social and advertising channels:
1. Instagram (visual, storytelling, hashtags)
2. LinkedIn (professional, business-oriented, value-driven)
3. TikTok (short, catchy, trendy, hashtag-focused)
4. Out-of-Home/OOH (billboards, print: short, high impact, no hashtags)

Provide a clean JSON array response matching this TypeScript schema:
[
  {
    "headline": "Main headline text",
    "tagline": "Supporting tagline text",
    "body": "Body copy paragraph",
    "cta": "Call to action text",
    "hashtags": ["list", "of", "hashtags"],
    "platform": "instagram" | "linkedin" | "tiktok" | "ooh"
  }
]`;

    try {
      const response = await this.openai.chat.completions.create({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Product Name: ${productName}
Product Category: ${analysis.productType}
Colors: ${analysis.colors.join(', ')}
Key Features: ${analysis.keyFeatures.join(', ')}
Emotional Tone: ${analysis.emotionalTone}
Marketing Angle: ${analysis.marketingAngle}

Please generate the 4 ad copy variants in JSON format.`,
          },
        ],
      });

      const jsonText = response.choices[0]?.message?.content || '[]';
      // Handle the key wrapping the array if GPT-4o decides to wrap it, though it should be direct.
      const parsed = JSON.parse(jsonText);
      const list = Array.isArray(parsed) ? parsed : (parsed.variants || Object.values(parsed)[0] as AdCopyVariant[]);

      return list.map((item: any) => ({
        headline: item.headline || '',
        tagline: item.tagline || '',
        body: item.body || '',
        cta: item.cta || '',
        hashtags: Array.isArray(item.hashtags) ? item.hashtags : [],
        platform: (['instagram', 'linkedin', 'tiktok', 'ooh'].includes(item.platform) ? item.platform : 'instagram') as AdPlatform,
      }));
    } catch (error) {
      console.error('Error in OpenAICopyGenerationAdapter:', error);
      throw new Error(`OpenAI Copy Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
