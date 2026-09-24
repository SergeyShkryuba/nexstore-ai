'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { contentHash, embedTexts, productEmbeddingText, toPgVector } from '@/lib/embeddings'
import { orderStatusSchema, parseProductForm, slugify } from '@/lib/admin-schemas'

type Supabase = Awaited<ReturnType<typeof createClient>>
type ActionResult = { success: true; id?: string } | { error: string }

/**
 * Every admin action checks the role itself. RLS would refuse the write
 * anyway; checking here turns that into a clear message instead of a raw
 * Postgres error, and never trusts the page that called the action.
 */
async function requireAdmin(): Promise<{ supabase: Supabase } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Forbidden' }

  return { supabase }
}

function revalidateCatalogue(slug?: string) {
  revalidatePath('/admin/products')
  revalidatePath('/')
  revalidatePath('/categories/[slug]', 'page')
  if (slug) revalidatePath(`/product/${slug}`)
}

/**
 * Keeps the product findable by meaning after a create or an edit. Not fatal:
 * the product is saved either way, and `npm run embed:catalogue` fills in
 * anything missed. Same text and hash as the backfill script, so it will not
 * redo this work.
 */
async function syncEmbedding(supabase: Supabase, productId: string) {
  try {
    const { data: product, error } = await supabase
      .from('products')
      .select('title, description, attributes, categories(name)')
      .eq('id', productId)
      .single()
    if (error) throw error

    const category = (product.categories as { name?: string } | null)?.name ?? null
    const text = productEmbeddingText({ ...product, category })
    const [embedding] = await embedTexts([text])
    const { error: upsertError } = await supabase.from('product_embeddings').upsert({
      product_id: productId,
      embedding: toPgVector(embedding),
      content_hash: await contentHash(text),
      updated_at: new Date().toISOString(),
    })
    if (upsertError) throw upsertError
  } catch (error) {
    console.error('Product saved, but embedding it failed:', error)
  }
}

export async function createProduct(formData: FormData): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  const { supabase } = auth

  const parsed = parseProductForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid product data' }
  }

  const baseSlug = slugify(parsed.data.title) || 'product'

  // `slug` is UNIQUE, so a second "Blue T-Shirt" used to fail with a raw
  // Postgres error. Suffix until it is free.
  let slug = baseSlug
  for (let attempt = 2; attempt <= 20; attempt++) {
    const { data: clash } = await supabase.from('products').select('id').eq('slug', slug).maybeSingle()
    if (!clash) break
    slug = `${baseSlug}-${attempt}`
  }

  const { data: created, error } = await supabase
    .from('products')
    .insert({ ...parsed.data, slug })
    .select('id')
    .single()

  if (error) {
    console.error('Error creating product:', error)
    return { error: 'Failed to create product' }
  }

  await syncEmbedding(supabase, created.id)
  revalidateCatalogue(slug)
  return { success: true, id: created.id }
}

/** The slug is kept on purpose: renaming a product must not break links to it. */
export async function updateProduct(productId: string, formData: FormData): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  const { supabase } = auth

  const parsed = parseProductForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid product data' }
  }

  const { data: updated, error } = await supabase
    .from('products')
    .update(parsed.data)
    .eq('id', productId)
    .select('id, slug')
    .maybeSingle()

  if (error) {
    console.error('Error updating product:', error)
    return { error: 'Failed to update product' }
  }
  if (!updated) return { error: 'Product not found' }

  await syncEmbedding(supabase, productId)
  revalidateCatalogue(updated.slug)
  return { success: true, id: productId }
}

/**
 * Past orders keep their line items: `order_items.product_id` is set null on
 * delete, and each line stores the price that was paid.
 */
export async function deleteProduct(productId: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  const { supabase } = auth

  const { data: deleted, error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId)
    .select('slug')
    .maybeSingle()

  if (error) {
    console.error('Error deleting product:', error)
    return { error: 'Failed to delete product' }
  }
  if (!deleted) return { error: 'Product not found' }

  revalidateCatalogue(deleted.slug)
  return { success: true }
}

export async function updateOrderStatus(orderId: string, status: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  const { supabase } = auth

  const parsed = orderStatusSchema.safeParse(status)
  if (!parsed.success) return { error: 'Unknown order status' }

  const { data: updated, error } = await supabase
    .from('orders')
    .update({ status: parsed.data })
    .eq('id', orderId)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('Error updating order status:', error)
    return { error: 'Failed to update the order' }
  }
  // RLS without an admin UPDATE policy filters the row out rather than erroring.
  if (!updated) return { error: 'Order not found, or orders cannot be edited yet (run schema.sql)' }

  revalidatePath('/admin/orders')
  revalidatePath('/profile')
  return { success: true }
}
