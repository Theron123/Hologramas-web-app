// Application Layer: GenerateCampaignUseCase
// Orchestrates the full campaign generation flow

import type { IVisionRepository, ICopyGenerationRepository, ICampaignRepository, IProductRepository } from '@domain/repositories';
import type { Campaign } from '@domain/entities/Campaign';
import type { Product } from '@domain/entities/Product';

export interface GenerateCampaignCommand {
  productName: string;
  images: Array<{ url: string; filename: string; size: number; mimeType: string }>;
  campaignName?: string;
}

export interface GenerateCampaignResult {
  campaign: Campaign;
  product: Product;
}

export class GenerateCampaignUseCase {
  constructor(
    private readonly visionRepo: IVisionRepository,
    private readonly copyRepo: ICopyGenerationRepository,
    private readonly campaignRepo: ICampaignRepository,
    private readonly productRepo: IProductRepository,
  ) {}

  async execute(command: GenerateCampaignCommand): Promise<GenerateCampaignResult> {
    // 1. Create product entity with images
    const { Campaign } = await import('@domain/entities/Campaign');
    const { Product } = await import('@domain/entities/Product');

    const imageAssets = command.images.map((img, i) => ({
      id: crypto.randomUUID(),
      url: img.url,
      filename: img.filename,
      mimeType: img.mimeType,
      size: img.size,
    }));

    let product = Product.create({
      name: command.productName,
      images: imageAssets,
    });

    // 2. Analyze product with AI Vision
    const imageUrls = imageAssets.map((a) => a.url);
    const analysis = await this.visionRepo.analyzeProduct(imageUrls, command.productName);
    product = product.withAnalysis(analysis);

    // 3. Save product
    const savedProduct = await this.productRepo.save(product);

    // 4. Generate ad copy variants
    const adCopyVariants = await this.copyRepo.generateAdCopy(analysis, command.productName);

    // 5. Create campaign entity
    let campaign = Campaign.create({
      name: command.campaignName ?? `Campaña ${command.productName}`,
      productName: command.productName,
      productDescription: analysis.marketingAngle,
      targetAudience: analysis.targetAudience,
      adCopyVariants,
    });

    // 6. Save campaign
    const savedCampaign = await this.campaignRepo.save(campaign);

    return { campaign: savedCampaign, product: savedProduct };
  }
}
