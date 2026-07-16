import { GoogleGenerativeAI } from '@google/generative-ai';
import type { IVisionRepository, ICopyGenerationRepository } from '@domain/repositories';
import type { ProductAnalysis } from '@domain/entities/Product';
import type { AdCopyVariant, AdPlatform } from '@domain/entities/Campaign';

// Overridable via env so a model deprecation/rename doesn't require a code change + redeploy.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1500
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }
    const errorStr = String(error);
    const isTransient = errorStr.includes('503') || 
                        errorStr.includes('Service Unavailable') || 
                        errorStr.includes('429') || 
                        errorStr.includes('Rate Limit') ||
                        errorStr.includes('ResourceExhausted') ||
                        errorStr.includes('fetch failed');
    if (!isTransient) {
      throw error;
    }
    console.warn(`Gemini API returned transient error. Retrying in ${delayMs}ms... (${retries} retries left). Error:`, errorStr);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return retryWithBackoff(fn, retries - 1, delayMs * 2);
  }
}

async function imageUrlToGenerativePart(url: string) {
  if (url.startsWith('data:')) {
    const [header, base64Data] = url.split(',');
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
    return {
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      },
    };
  } else {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = response.headers.get('content-type') || 'image/png';
      return {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: mimeType
        },
      };
    } catch (e) {
      console.error('Error fetching external image for Gemini:', e);
      throw new Error(`Failed to fetch image for Gemini: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }
}

export class GeminiVisionAdapter implements IVisionRepository {
  private readonly genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async analyzeProduct(imageUrls: string[], productName?: string): Promise<ProductAnalysis> {
    if (imageUrls.length === 0) {
      throw new Error('At least one image is required for product analysis');
    }

    const nameHint = productName ? `(The user suggests the name is "${productName}")` : '';

    const systemPrompt = `You are an expert marketing strategist and product designer.
Analyze the product images provided by the user (which show different views, close-ups, details, or angles of the same product). 

CRITICAL INSTRUCTIONS FOR HIGH QUALITY:
1. MULTIPLE VIEW SYNTHESIS: You have received multiple images in a carousel. Synthesize all perspectives (front, back, sides, close-ups) to extract micro-details like fine text, logo shapes, materials (leather, mesh, metal), and exact geometric lines.
2. PRODUCT NAME FOCUS: If a specific product name is provided (e.g., "${productName || ''}"), use its brand equity, model name, and context to enrich your analysis. Do not treat it as a generic item; analyze it with its specific industry positioning.
3. Provide a clean JSON response matching this schema:
{
  "productType": "Detailed name/category of the product (e.g. 'Air Jordan 1 Retro Sneaker', 'Red Rose Flower', 'Luxury Leather Watch')",
  "colors": ["list of 3 to 4 dominant hex colors found on the product, starting with the most prominent"],
  "mood": "3 descriptive words of the product's mood (e.g. 'premium, energetic, classic')",
  "targetAudience": "Specific description of who would buy this product",
  "keyFeatures": ["3 key visual or functional features of the product shown in the images"],
  "suggestedTaglines": ["3 high-impact marketing taglines for this product"],
  "campaignTheme": "A concise creative theme direction (e.g. 'Retro luxury meets modern comfort')",
  "emotionalTone": "The emotional feeling (e.g. 'Aspirational and sleek')",
  "marketingAngle": "How to position this product to stand out in the market"
}`;

    try {
      const model = this.genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      // Map and convert ALL uploaded images from the carousel to pass them to Gemini
      console.log(`Converting ${imageUrls.length} carousel images for Gemini analysis...`);
      const imageParts = await Promise.all(
        imageUrls.map((url) => imageUrlToGenerativePart(url))
      );
      
      const prompt = `${systemPrompt}\n\nPlease analyze this product ${nameHint} based on the provided images showing different angles/details. Return only the JSON object.`;

      const response = await retryWithBackoff(() => model.generateContent([prompt, ...imageParts]));
      const jsonText = response.response.text();
      console.log('Gemini Vision response:', jsonText);
      return JSON.parse(jsonText) as ProductAnalysis;
    } catch (error) {
      console.error('Error in GeminiVisionAdapter:', error);
      throw new Error(`Gemini Vision analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export class GeminiCopyGenerationAdapter implements ICopyGenerationRepository {
  private readonly genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateAdCopy(analysis: ProductAnalysis, productName: string): Promise<AdCopyVariant[]> {
    const systemPrompt = `You are a high-performing conversion copywriter.
Based on the following product analysis, write 4 distinct copy variants tailored to specific social and advertising channels:
1. Instagram (visual, storytelling, hashtags)
2. LinkedIn (professional, business-oriented, value-driven)
3. TikTok (short, catchy, trendy, hashtag-focused)
4. Out-of-Home/OOH (billboards, print: short, high impact, no hashtags)

CRITICAL INSTRUCTIONS FOR HIGH QUALITY:
- USE SPECIFIC NAME: Incorporate the exact product name "${productName}" and brand context in headlines and body copy. Do NOT use generic terms like "this product", "these shoes", or "this device". Leverage the specificity of the name to make the copywriting premium and tailored.
- USE KEY DETAILS: Reference the specific visual features, materials, and colors detected in the analysis.

Provide a clean JSON array response matching this schema (do not wrap in a parent key, return direct array):
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
      const model = this.genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      const prompt = `${systemPrompt}
      
Product Name: ${productName}
Product Category: ${analysis.productType}
Colors: ${analysis.colors.join(', ')}
Key Features: ${analysis.keyFeatures.join(', ')}
Emotional Tone: ${analysis.emotionalTone}
Marketing Angle: ${analysis.marketingAngle}

Please generate the 4 ad copy variants in JSON format.`;

      const response = await retryWithBackoff(() => model.generateContent(prompt));
      const jsonText = response.response.text();
      console.log('Gemini Copy response:', jsonText);
      
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
      console.error('Error in GeminiCopyGenerationAdapter:', error);
      throw new Error(`Gemini Copy Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
