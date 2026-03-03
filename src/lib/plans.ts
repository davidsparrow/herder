export type PlanTier = "free" | "standard" | "pro";

export interface PlanConfig {
  name: string;
  price: string;               // display price
  maxLists: number | null;     // null = unlimited
  maxNamesPerList: number | null;
  customColumns: boolean;
  notifications: boolean;
  qrCodes: boolean;
  analytics: boolean;
  description: string;
  badge: string;
}

export const PLANS: Record<PlanTier, PlanConfig> = {
  free: {
    name: "Free",
    price: "$0 / mo",
    maxLists: 3,
    maxNamesPerList: 20,
    customColumns: false,
    notifications: true, // MVP: Enabled for now
    qrCodes: false,
    analytics: false,
    description: "Perfect for trying Herder with a single class.",
    badge: "🐑",
  },
  standard: {
    name: "Standard",
    price: "$12 / mo",
    maxLists: null,
    maxNamesPerList: null,
    customColumns: true,
    notifications: false,
    qrCodes: true,
    analytics: true,
    description: "Unlimited lists and custom columns for active teachers.",
    badge: "🐄",
  },
  pro: {
    name: "Pro",
    price: "$29 / mo",
    maxLists: null,
    maxNamesPerList: null,
    customColumns: true,
    notifications: true,
    qrCodes: true,
    analytics: true,
    description: "Full power: SMS/email notifications + everything in Standard.",
    badge: "🦬",
  },
};

// ── Runtime gate helpers ──────────────────────────────────────────────────────

export function canCreateList(tier: PlanTier, currentListCount: number): {
  allowed: boolean; reason?: string;
} {
  const plan = PLANS[tier];
  if (plan.maxLists === null) return { allowed: true };
  if (currentListCount >= plan.maxLists) {
    return {
      allowed: false,
      reason: `Free plan is limited to ${plan.maxLists} lists. Upgrade to create more.`,
    };
  }
  return { allowed: true };
}

export function canAddName(tier: PlanTier, currentCount: number): {
  allowed: boolean; reason?: string;
} {
  const plan = PLANS[tier];
  if (plan.maxNamesPerList === null) return { allowed: true };
  if (currentCount >= plan.maxNamesPerList) {
    return {
      allowed: false,
      reason: `Free plan supports up to ${plan.maxNamesPerList} names per list. Upgrade for unlimited.`,
    };
  }
  return { allowed: true };
}

export function hasFeature(tier: PlanTier, feature: keyof PlanConfig): boolean {
  return Boolean(PLANS[tier][feature]);
}

// Default plan limits that Admin can override per-org (stored in DB)
export interface OrgPlanOverrides {
  maxLists?: number | null;
  maxNamesPerList?: number | null;
  customColumns?: boolean;
  notifications?: boolean;
}

export function resolveLimit<K extends keyof PlanConfig>(
  tier: PlanTier,
  key: K,
  overrides?: OrgPlanOverrides
): PlanConfig[K] {
  if (overrides && key in overrides && overrides[key as keyof OrgPlanOverrides] !== undefined) {
    return overrides[key as keyof OrgPlanOverrides] as PlanConfig[K];
  }
  return PLANS[tier][key];
}
