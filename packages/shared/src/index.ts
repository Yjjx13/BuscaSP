export const PRODUCT_STATUS = [
  'DRAFT', 'PUBLISHED', 'OFF_SHELF', 'SOLD', 'PENDING_REVIEW', 'REJECTED', 'VIOLATION', 'DELETED'
] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];

export const WANTED_STATUS = ['ACTIVE', 'FOUND', 'EXPIRED', 'OFF_SHELF', 'VIOLATION', 'DELETED'] as const;
export type WantedStatus = (typeof WANTED_STATUS)[number];

export const CONTACT_POLICIES = ['PUBLIC', 'LOGIN_ONLY', 'MEMBER_ONLY', 'AFTER_INQUIRY'] as const;
export type ContactPolicy = (typeof CONTACT_POLICIES)[number];

export const PRICE_TYPES = ['FIXED', 'NEGOTIABLE'] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

