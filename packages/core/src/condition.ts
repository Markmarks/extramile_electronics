import type { Enums } from './db/database.types';

export type ProductCondition = Enums<'product_cond'>;

/** Display order for pickers and filters — most common first. */
export const PRODUCT_CONDITIONS: ProductCondition[] = ['new', 'used', 'open_box', 'refurbished'];

/** Customer-facing names, shared by the storefront and the back office. */
export const CONDITION_LABELS: Record<ProductCondition, string> = {
  new: 'Brand new',
  used: 'Fairly used',
  open_box: 'Open box',
  refurbished: 'Refurbished',
};

/** One-line explanation shown next to the condition on the product page. */
export const CONDITION_NOTES: Record<ProductCondition, string> = {
  new: 'Sealed in the original box, never used.',
  used: 'Previously owned, inspected and fully working. May show light signs of use.',
  open_box: 'Box opened, item unused or barely used, with all accessories.',
  refurbished: 'Restored and tested to full working order.',
};
