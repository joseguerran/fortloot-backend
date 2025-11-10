/**
 * Types for Epic Games Storefront Catalog API
 * Endpoint: https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/storefront/v2/catalog
 */

export interface EpicCatalogResponse {
  refreshIntervalHrs: number;
  dailyPurchaseHrs: number;
  expiration: string;
  storefronts: EpicStorefront[];
}

export interface EpicStorefront {
  name: string;
  catalogEntries: EpicCatalogEntry[];
}

export interface EpicCatalogEntry {
  offerId: string;
  devName: string;
  offerType: string;
  prices: EpicPrice[];
  categories: string[];
  catalogGroup?: string;
  catalogGroupPriority?: number;
  sortPriority?: number;
  title?: string;
  shortDescription?: string;
  description?: string;
  displayAssetPath?: string;
  itemGrants: EpicItemGrant[];
  dailyLimit?: number;
  weeklyLimit?: number;
  monthlyLimit?: number;
  appStoreId?: string[];
  requirements?: EpicRequirement[];
  metaInfo?: EpicMetaInfo[];
  meta?: Record<string, any>;
  matchFilter?: string;
  filterWeight?: number;
  giftInfo?: EpicGiftInfo;
}

export interface EpicPrice {
  currencyType: string;
  currencySubType: string;
  regularPrice: number;
  dynamicRegularPrice: number;
  finalPrice: number;
  saleExpiration?: string;
  basePrice: number;
}

export interface EpicItemGrant {
  templateId: string;
  quantity: number;
}

export interface EpicRequirement {
  requirementType: string;
  requiredId: string;
  minQuantity: number;
}

export interface EpicMetaInfo {
  key: string;
  value: string;
}

export interface EpicGiftInfo {
  bIsEnabled: boolean;
  forcedGiftBoxTemplateId?: string;
  purchaseRequirements?: any[];
  giftRecordIds?: string[];
}

/**
 * Parsed catalog item for easier searching and consumption
 */
export interface ParsedCatalogItem {
  offerId: string;
  itemId: string;
  name: string;
  description: string;
  type: string;
  price: number;
  currencyType: string;
  rarity?: string;
  giftable: boolean;
  displayAssetPath?: string;
}

/**
 * Search result when looking for items by name or ID
 */
export interface CatalogSearchResult {
  found: boolean;
  exactMatch: boolean;
  item?: ParsedCatalogItem;
  suggestions?: ParsedCatalogItem[];
}
