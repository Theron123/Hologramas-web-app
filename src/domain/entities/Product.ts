// Domain Entity: Product
// Represents the product/subject being advertised

export interface ImageAsset {
  id: string;
  url: string;           // blob URL or data URL client-side; server URL after upload
  filename: string;
  mimeType: string;
  width?: number;
  height?: number;
  size: number;          // bytes
  processedUrl?: string; // URL after background removal / enhancement
}

export class Product {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly images: ImageAsset[];
  readonly primaryImage: ImageAsset | null;
  readonly aiAnalysis: ProductAnalysis | null;

  constructor(props: {
    id: string;
    name: string;
    description?: string;
    category?: string;
    images?: ImageAsset[];
    aiAnalysis?: ProductAnalysis | null;
  }) {
    this.id = props.id;
    this.name = props.name;
    this.description = props.description ?? '';
    this.category = props.category ?? 'general';
    this.images = props.images ?? [];
    this.primaryImage = this.images[0] ?? null;
    this.aiAnalysis = props.aiAnalysis ?? null;
  }

  static create(props: Omit<ConstructorParameters<typeof Product>[0], 'id'>): Product {
    return new Product({ ...props, id: crypto.randomUUID() });
  }

  withImages(images: ImageAsset[]): Product {
    return new Product({ ...this, images });
  }

  withAnalysis(analysis: ProductAnalysis): Product {
    return new Product({ ...this, aiAnalysis: analysis });
  }

  hasImages(): boolean {
    return this.images.length > 0;
  }

  isCarousel(): boolean {
    return this.images.length > 1;
  }
}

export interface ProductAnalysis {
  productType: string;
  colors: string[];
  mood: string;
  targetAudience: string;
  keyFeatures: string[];
  suggestedTaglines: string[];
  campaignTheme: string;
  emotionalTone: string;
  marketingAngle: string;
}
