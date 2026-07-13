'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

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

  // Extract form data
  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const price = parseFloat(formData.get('price') as string)
  const category_id = formData.get('category_id') as string
  const imageUrl = formData.get('image_url') as string
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')

  // Basic validation
  if (!title || !price || !category_id) {
    return { error: 'Please fill out all required fields' }
  }

  const { error } = await supabase.from('products').insert({
    title,
    description,
    price,
    slug,
    category_id,
    image_urls: imageUrl ? [imageUrl] : []
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
