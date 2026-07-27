import { ulid } from 'ulid'

export type IdPrefix = 'usr' | 'ses' | 'prd' | 'var' | 'crt' | 'cit' | 'ord' | 'rev'

export const ID_PREFIXES = {
  USER: 'usr',
  SESSION: 'ses',
  PRODUCT: 'prd',
  VARIANT: 'var',
  CART: 'crt',
  CART_ITEM: 'cit',
  ORDER: 'ord',
  REVIEW: 'rev',
} as const

export function generateId<P extends IdPrefix>(prefix: P): `${P}_${string}` {
  return `${prefix}_${ulid()}`
}

export function generateUserId(): `usr_${string}` {
  return generateId('usr')
}

export function generateSessionId(): `ses_${string}` {
  return generateId('ses')
}

export function generateProductId(): `prd_${string}` {
  return generateId('prd')
}

export function generateVariantId(): `var_${string}` {
  return generateId('var')
}

export function generateCartId(): `crt_${string}` {
  return generateId('crt')
}
export function generateCartItemId(): `cit_${string}` {
  return generateId('cit')
}


export function generateOrderId(): `ord_${string}` {
  return generateId('ord')
}

export function generateReviewId(): `rev_${string}` {
  return generateId('rev')
}

export function isValidId(id: string, prefix?: IdPrefix): boolean {
  if (!id || typeof id !== 'string') return false
  const parts = id.split('_')
  if (parts.length !== 2) return false
  const [idPrefix, ulidPart] = parts
  if (prefix && idPrefix !== prefix) return false
  const validPrefixes: string[] = Object.values(ID_PREFIXES)
  if (!validPrefixes.includes(idPrefix)) return false
  // ULID is 26 uppercase base32 chars
  return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(ulidPart)
}
