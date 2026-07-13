import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// Code for integrating real APIs (Gemini + Tavily/SerpApi) is commented out for demo purposes
/*
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

export async function POST(req: Request) {
  try {
    const { query } = await req.json()

    // 1. Use Gemini to extract search parameters from user input
    const { text: searchParamsJson } = await generateText({
      model: google('gemini-1.5-pro'),
      prompt: `Analyze the user's e-commerce search query and return a JSON object with parameters.
      Query: "${query}"
      Expected format: { "category": "...", "maxPrice": number, "keywords": ["..."] }`,
    })
    
    const searchParams = JSON.parse(searchParamsJson)

    // 2. Search locally in our database (e.g. Supabase)
    // const { data: localProducts } = await supabase
    //   .from('products')
    //   .textSearch('title', searchParams.keywords.join(' | '))
    //   .lte('price', searchParams.maxPrice)

    // 3. Search globally using Tavily API (aggregator)
    // const tavilyResponse = await fetch('https://api.tavily.com/search', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     api_key: process.env.TAVILY_API_KEY,
    //     query: query,
    //     search_depth: "basic",
    //     include_domains: ["amazon.com", "ebay.com", "bestbuy.com"]
    //   })
    // })
    // const tavilyData = await tavilyResponse.json()
    // const globalProducts = tavilyData.results.map(r => ({
    //   title: r.title, url: r.url, content: r.content, source: 'Global Network'
    // }))

    // return NextResponse.json({ local: localProducts, global: globalProducts })

  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
*/

export async function POST(req: Request) {
  try {
    const { query } = await req.json()
    const lowerQuery = query.toLowerCase()

    // Simulate network delay to mimic AI processing
    await new Promise(resolve => setTimeout(resolve, 1500))

    const supabase = await createClient()
    const { data: allProducts } = await supabase.from('products').select('*')
    const products = allProducts || []

    // Keyword stems for category inference
    const electronicsKeywords = ['phone', 'smart', 'laptop', 'pc', 'comput', 'headphone', 'electronic', 'tablet']
    const clothingKeywords = ['shirt', 't-shirt', 'sweater', 'jean', 'cloth', 'jacket', 'sneaker', 'shoe']
    const smartHomeKeywords = ['bulb', 'vacuum', 'smart home', 'socket', 'robot', 'light', 'speaker']

    let inferredCategoryId = null
    // Assuming category IDs are the UUIDs from seed.sql. We'll fetch categories to map.
    const { data: categories } = await supabase.from('categories').select('*')
    const catMap = Object.fromEntries((categories || []).map(c => [c.slug, c.id]))

    if (electronicsKeywords.some(kw => lowerQuery.includes(kw))) inferredCategoryId = catMap['electronics']
    else if (clothingKeywords.some(kw => lowerQuery.includes(kw))) inferredCategoryId = catMap['clothing']
    else if (smartHomeKeywords.some(kw => lowerQuery.includes(kw))) inferredCategoryId = catMap['smart-home']

    const local = products.filter(p => {
      const textMatch = p.title.toLowerCase().includes(lowerQuery) || (p.description && p.description.toLowerCase().includes(lowerQuery))
      
      // If we inferred a category, prioritize returning products from that category
      if (inferredCategoryId) {
        return p.category_id === inferredCategoryId
      }
      return textMatch
    })

    // If nothing found, return a random product for demonstration purposes
    if (local.length === 0 && lowerQuery.length > 2 && products.length > 0) {
      local.push(products[Math.floor(Math.random() * products.length)])
    }

    // Generate mock external products based on the inferred category
    const categoryName = inferredCategoryId === catMap['electronics'] ? 'Electronics' : 
                         inferredCategoryId === catMap['clothing'] ? 'Clothing' : 
                         inferredCategoryId === catMap['smart-home'] ? 'Smart Home' : 'Product'

    const global = [
      {
        id: 'ext-1',
        title: `${query || categoryName} (Found on Amazon)`,
        price: Math.floor(Math.random() * 500) + 50,
        source: 'Amazon',
        url: 'https://amazon.com',
        image_url: 'https://placehold.co/400x400?text=Amazon'
      },
      {
        id: 'ext-2',
        title: `Premium ${query || categoryName}`,
        price: Math.floor(Math.random() * 800) + 100,
        source: 'eBay',
        url: 'https://ebay.com',
        image_url: 'https://placehold.co/400x400?text=eBay'
      }
    ]

    return NextResponse.json({ local, global })
  } catch (error) {
    console.error('Search API error:', error)
    return NextResponse.json({ error: 'Failed to process search' }, { status: 500 })
  }
}
