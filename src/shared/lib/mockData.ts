export const MOCK_CATEGORIES = [
  { id: '1', slug: 'electronics', name: 'Electronics', description: 'Gadgets and smartphones' },
  { id: '2', slug: 'clothing', name: 'Clothing', description: 'Stylish apparel' },
  { id: '3', slug: 'smart-home', name: 'Smart Home', description: 'Home automation devices' },
]

export const MOCK_PRODUCTS = [
  {
    id: 'p1',
    category_id: '1',
    title: 'Smartphone X Pro',
    slug: 'smartphone-x-pro',
    description: 'Flagship smartphone with an advanced neural processor.',
    price: 999.00,
    image_urls: ['https://placehold.co/400x400?text=Smartphone'],
    attributes: { color: 'black', storage: '256GB' }
  },
  {
    id: 'p2',
    category_id: '1',
    title: 'NoiseCancel Wireless Headphones',
    slug: 'headphones-noisecancel',
    description: 'Industry-leading noise cancellation and crystal clear sound.',
    price: 199.00,
    image_urls: ['https://placehold.co/400x400?text=Headphones'],
    attributes: { color: 'white' }
  },
  {
    id: 'p3',
    category_id: '2',
    title: 'Arctic Winter Jacket',
    slug: 'winter-jacket-arctic',
    description: 'Premium warm jacket for harsh winter conditions.',
    price: 149.00,
    image_urls: ['https://placehold.co/400x400?text=Jacket'],
    attributes: { color: 'blue', size: 'L', season: 'winter' }
  },
  {
    id: 'p4',
    category_id: '3',
    title: 'RGB Smart Bulb',
    slug: 'smart-bulb-rgb',
    description: 'Control your lighting with your smartphone or voice.',
    price: 29.00,
    image_urls: ['https://placehold.co/400x400?text=Smart+Bulb'],
    attributes: { color: 'multicolor', power: '10W' }
  }
]
