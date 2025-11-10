export interface KitProduct {
  id: string;
  name: string;
  use: string;
}

export interface BulkKitResult {
  created: number;
  updated: number;
  errors: Array<{ name: string; error: string }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export interface KitStat {
  kit_category: string;
  count: string;
}

export interface SyncKitResult {
  created: number;
  updated: number;
  deleted: number;
  errors: Array<{ name: string; error: string }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
  details: {
    createdKits: string[];
    updatedKits: string[];
    deletedKits: string[];
  };
}
