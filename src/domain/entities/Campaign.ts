// Domain Entity: Campaign
// Pure business logic, no framework dependencies

export type CampaignStatus = 'draft' | 'generating' | 'ready' | 'exported';

export type AdPlatform = 'instagram' | 'linkedin' | 'facebook' | 'ooh' | 'tiktok';

export interface AdCopyVariant {
  headline: string;
  tagline: string;
  body: string;
  cta: string;
  hashtags: string[];
  platform: AdPlatform;
}

export interface CampaignTheme {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  glowColor: string;
  preset: 'neon-blue' | 'gold-premium' | 'matrix-green' | 'cyberpunk-violet' | 'custom';
}

export class Campaign {
  readonly id: string;
  readonly name: string;
  readonly productName: string;
  readonly status: CampaignStatus;
  readonly productDescription: string;
  readonly targetAudience: string;
  readonly adCopyVariants: AdCopyVariant[];
  readonly theme: CampaignTheme;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: {
    id: string;
    name: string;
    productName: string;
    productDescription: string;
    targetAudience: string;
    status?: CampaignStatus;
    adCopyVariants?: AdCopyVariant[];
    theme?: CampaignTheme;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = props.id;
    this.name = props.name;
    this.productName = props.productName;
    this.productDescription = props.productDescription;
    this.targetAudience = props.targetAudience;
    this.status = props.status ?? 'draft';
    this.adCopyVariants = props.adCopyVariants ?? [];
    this.theme = props.theme ?? Campaign.defaultTheme();
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static create(props: Omit<ConstructorParameters<typeof Campaign>[0], 'id' | 'createdAt' | 'updatedAt'>): Campaign {
    return new Campaign({
      ...props,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static defaultTheme(): CampaignTheme {
    return {
      name: 'Neon Blue',
      primaryColor: '#00d4ff',
      secondaryColor: '#7800ff',
      accentColor: '#00ff88',
      glowColor: '#00d4ff',
      preset: 'neon-blue',
    };
  }

  withStatus(status: CampaignStatus): Campaign {
    return new Campaign({ ...this, status, updatedAt: new Date() });
  }

  withAdCopy(variants: AdCopyVariant[]): Campaign {
    return new Campaign({ ...this, adCopyVariants: variants, status: 'ready', updatedAt: new Date() });
  }

  withTheme(theme: CampaignTheme): Campaign {
    return new Campaign({ ...this, theme, updatedAt: new Date() });
  }

  isReady(): boolean {
    return this.status === 'ready' && this.adCopyVariants.length > 0;
  }
}
