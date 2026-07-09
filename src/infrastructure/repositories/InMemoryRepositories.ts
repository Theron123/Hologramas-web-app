// Infrastructure: In-Memory Repository implementations

import type { ICampaignRepository, IProductRepository } from '@domain/repositories';
import type { Campaign } from '@domain/entities/Campaign';
import type { Product } from '@domain/entities/Product';

// ────────────────────────────────────────────────
// In-Memory Campaign Repository
// ────────────────────────────────────────────────
export class InMemoryCampaignRepository implements ICampaignRepository {
  private campaigns = new Map<string, Campaign>();

  async findById(id: string): Promise<Campaign | null> {
    return this.campaigns.get(id) ?? null;
  }

  async findAll(): Promise<Campaign[]> {
    return Array.from(this.campaigns.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async save(campaign: Campaign): Promise<Campaign> {
    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  async update(campaign: Campaign): Promise<Campaign> {
    if (!this.campaigns.has(campaign.id)) throw new Error(`Campaign ${campaign.id} not found`);
    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  async delete(id: string): Promise<void> {
    this.campaigns.delete(id);
  }
}

// ────────────────────────────────────────────────
// In-Memory Product Repository
// ────────────────────────────────────────────────
export class InMemoryProductRepository implements IProductRepository {
  private products = new Map<string, Product>();

  async findById(id: string): Promise<Product | null> {
    return this.products.get(id) ?? null;
  }

  async save(product: Product): Promise<Product> {
    this.products.set(product.id, product);
    return product;
  }

  async update(product: Product): Promise<Product> {
    if (!this.products.has(product.id)) throw new Error(`Product ${product.id} not found`);
    this.products.set(product.id, product);
    return product;
  }
}

// ────────────────────────────────────────────────
// Singleton instances for the app (server-side)
// ────────────────────────────────────────────────
let campaignRepo: InMemoryCampaignRepository | null = null;
let productRepo: InMemoryProductRepository | null = null;

export function getCampaignRepository(): InMemoryCampaignRepository {
  if (!campaignRepo) campaignRepo = new InMemoryCampaignRepository();
  return campaignRepo;
}

export function getProductRepository(): InMemoryProductRepository {
  if (!productRepo) productRepo = new InMemoryProductRepository();
  return productRepo;
}
