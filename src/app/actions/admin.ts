'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { contentHash, embedTexts, productEmbeddingText, toPgVector } from '@/lib/embeddings'
import { orderStatusSchema, parseCategoryForm, parseProductForm, slugify, type ProductInput } from '@/lib/admin-schemas'
import { parseVariantsField, type VariantInput } from '@/lib/variants'

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

/**
 * `slug` is UNIQUE, so a second "Blue T-Shirt" used to fail with a raw
 * Postgres error. Suffix until it is free. A race between two admins saving
 * the same name at once still ends in the unique constraint, as an error.
 */
async function freeSlug(supabase: Supabase, table: 'products' | 'categories', base: string) {
  let slug = base
  for (let attempt = 2; attempt <= 20; attempt++) {
    const { data: clash } = await supabase.from(table).select('id').eq('slug', slug).maybeSingle()
    if (!clash) break
    slug = `${base}-${attempt}`
  }
  return slug
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

/**
 * Reads the product form: fields plus the sizes editor (JSON). Both are
 * validated before anything is written.
 */
type ProductForm =
  | { fields: ProductInput; variants: VariantInput[] | null }
  | { error: string }

function readProductForm(formData: FormData): ProductForm {
  const parsed = parseProductForm(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid product data' }
  const variants = parseVariantsField(formData.get('variants'))
  if (!variants.success) return { error: variants.error }
  return { fields: parsed.data, variants: variants.data }
}

/** Postgres error from save_product() → what the admin should read. */
function saveProductError(error: { code?: string; message?: string }, fallback: string): string {
  if (error.message === 'product_not_found') return 'Product not found'
  if (error.code === '23505') return 'Another product already uses that name or size — please try again'
  return fallback
}

export async function createProduct(formData: FormData): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  const { supabase } = auth

  const form = readProductForm(formData)
  if ('error' in form) return { error: form.error }

  const slug = await freeSlug(supabase, 'products', slugify(form.fields.title) || 'product')

  // Product and sizes in one transaction (save_product in schema.sql).
  const { data: id, error } = await supabase.rpc('save_product', {
    p_product_id: null,
    p_fields: { ...form.fields, slug },
    p_variants: form.variants,
  })

  if (error) {
    console.error('Error creating product:', error)
    return { error: saveProductError(error, 'Failed to create product') }
  }

  await syncEmbedding(supabase, id as string)
  revalidateCatalogue(slug)
  return { success: true, id: id as string }
}

/** The slug is kept on purpose: renaming a product must not break links to it. */
export async function updateProduct(productId: string, formData: FormData): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  const { supabase } = auth

  const form = readProductForm(formData)
  if ('error' in form) return { error: form.error }

  const { error } = await supabase.rpc('save_product', {
    p_product_id: productId,
    p_fields: form.fields,
    p_variants: form.variants,
  })

  if (error) {
    console.error('Error updating product:', error)
    return { error: saveProductError(error, 'Failed to update product') }
  }

  const { data: saved } = await supabase.from('products').select('slug').eq('id', productId).maybeSingle()
  await syncEmbedding(supabase, productId)
  revalidateCatalogue(saved?.slug)
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

// ------------------------------- Categories ---------------------------------

/**
 * Categories appear in the header, the footer, the homepage and every
 * category page, so a change revalidates the whole layout.
 */
function revalidateCategories() {
  revalidatePath('/', 'layout')
}

/** A category's name is part of its products' search text; re-embed them. */
async function reembedCategoryProducts(supabase: Supabase, categoryId: string | null, productIds?: string[]) {
  const ids =
    productIds ??
    ((await supabase.from('products').select('id').eq('category_id', categoryId)).data ?? []).map((p) => p.id)
  for (const id of ids) await syncEmbedding(supabase, id)
}

export async function createCategory(formData: FormData): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  const { supabase } = auth

  const parsed = parseCategoryForm(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid category' }

  const { name, description, image_url } = parsed.data
  const slug = await freeSlug(supabase, 'categories', slugify(name) || 'category')

  const { data: created, error } = await supabase
    .from('categories')
    .insert({ name, slug, description, image_url: image_url || null })
    .select('id')
    .single()

  if (error) {
    console.error('Error creating category:', error)
    return { error: 'Failed to create category' }
  }

  revalidateCategories()
  return { success: true, id: created.id }
}

/** The slug is kept on purpose: renaming must not break links to the category. */
export async function updateCategory(categoryId: string, formData: FormData): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  const { supabase } = auth

  const parsed = parseCategoryForm(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid category' }

  const { data: before } = await supabase.from('categories').select('name').eq('id', categoryId).maybeSingle()
  if (!before) return { error: 'Category not found' }

  const { name, description, image_url } = parsed.data
  const { error } = await supabase
    .from('categories')
    .update({ name, description, image_url: image_url || null })
    .eq('id', categoryId)

  if (error) {
    console.error('Error updating category:', error)
    return { error: 'Failed to update category' }
  }

  if (before.name !== name) await reembedCategoryProducts(supabase, categoryId)
  revalidateCategories()
  return { success: true, id: categoryId }
}

/** Its products are kept and become uncategorised (category_id is set null). */
export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  const { supabase } = auth

  // Read before deleting: afterwards the link from these products is gone.
  const { data: orphans } = await supabase.from('products').select('id').eq('category_id', categoryId)

  const { data: deleted, error } = await supabase
    .from('categories')
    .delete()
    .eq('id', categoryId)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('Error deleting category:', error)
    return { error: 'Failed to delete category' }
  }
  if (!deleted) return { error: 'Category not found' }

  await reembedCategoryProducts(supabase, null, (orphans ?? []).map((p) => p.id))
  revalidateCategories()
  return { success: true }
}
