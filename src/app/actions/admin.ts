'use server'

import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

const productSchema = z.object({
  title: z.string().trim().min(2, 'Title is required').max(120),
  description: z.string().trim().max(2000).optional().default(''),
  // `price` was previously validated with `!price`, which rejected a legitimate
  // free product and accepted NaN from a non-numeric field.
  price: z.coerce.number().nonnegative('Price must be zero or more'),
  inventory_count: z.coerce.number().int().min(0).default(0),
  category_id: z.string().uuid('Pick a category'),
  image_url: z.string().url().or(z.literal('')).optional().default(''),
})

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

export async function createProduct(formData: FormData) {
  const supabase = await createClient()

  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return { error: 'Forbidden' }

  const parsed = productSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    price: formData.get('price'),
    inventory_count: formData.get('inventory_count') ?? 0,
    category_id: formData.get('category_id'),
    image_url: formData.get('image_url') ?? '',
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid product data' }
  }

  const { title, description, price, inventory_count, category_id, image_url } = parsed.data
  const baseSlug = slugify(title) || 'product'

  // `slug` is UNIQUE, so a second "Blue T-Shirt" used to fail with a raw
  // Postgres error. Suffix until it is free.
  let slug = baseSlug
  for (let attempt = 2; attempt <= 20; attempt++) {
    const { data: clash } = await supabase
      .from('products')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!clash) break
    slug = `${baseSlug}-${attempt}`
  }

  const { error } = await supabase.from('products').insert({
    title,
    description,
    price,
    inventory_count,
    slug,
    category_id,
    image_urls: image_url ? [image_url] : [],
  })

  if (error) {
    console.error('Error creating product:', error)
    return { error: 'Failed to create product' }
  }

  revalidatePath('/admin/products')
  revalidatePath('/')
  revalidatePath('/categories/[slug]', 'page')
  return { success: true }
}
