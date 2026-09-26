// @vitest-environment node
/**
 * `schema.sql` against a real Postgres (see `./db.ts`): the money and stock
 * functions, and what a browser holding the public anon key can and cannot
 * do. These are the rules that the TypeScript tests can only mock.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createDb, createUser } from './db'

let db: PGlite

beforeAll(async () => {
  db = await createDb()
}, 60_000)

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0]
}

const productId = async (slug: string) => (await one<{ id: string }>('select id from products where slug = $1', [slug])).id
const stock = async (slug: string) =>
  (await one<{ n: number }>('select inventory_count as n from products where slug = $1', [slug])).n
const sizeStock = async (slug: string, size: string) =>
  (
    await one<{ n: number }>(
      `select v.inventory_count as n from product_variants v join products p on p.id = v.product_id
       where p.slug = $1 and v.size = $2`,
      [slug, size],
    )
  ).n

type Line = { product_id: string; quantity: number; variant_id?: string }

const reserve = async (items: Line[], owner: string | null = null, maxHeld: number | null = null) =>
  (
    await one<{ id: string }>('select reserve_stock($1::jsonb, 600, $2, $3) as id', [
      JSON.stringify(items),
      owner,
      maxHeld,
    ])
  ).id

const release = async (reservationId: string) =>
  (await one<{ ok: boolean }>('select release_reservation($1) as ok', [reservationId])).ok

const recordPaid = async (sessionId: string, userId: string | null, lines: Line[], reservationId: string | null) =>
  (
    await one<{ id: string | null }>(
      'select record_paid_order($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) as id',
      [
        sessionId,
        userId,
        'buyer@example.test',
        10,
        JSON.stringify({ name: 'Test Buyer' }),
        JSON.stringify(lines.map((line) => ({ ...line, unit_price: 5 }))),
        reservationId,
      ],
    )
  ).id

describe('schema.sql', () => {
  it('re-runs cleanly, leaving one reserve_stock (the old two-argument one is replaced)', async () => {
    // createDb() already applied it twice over; this is what that left.
    const { n } = await one<{ n: number }>(`select count(*)::int as n from pg_proc where proname = 'reserve_stock'`)
    expect(n).toBe(1)
  })

  it("keeps a sized product's total equal to its sizes", async () => {
    const { total, sizes } = await one<{ total: number; sizes: number }>(
      `select p.inventory_count as total, sum(v.inventory_count)::int as sizes
       from products p join product_variants v on v.product_id = p.id
       where p.slug = 'cotton-tshirt' group by p.inventory_count`,
    )
    expect(total).toBe(sizes)
  })
})

describe('stock reservations', () => {
  it('reserves all lines or none', async () => {
    const before = await stock('wireless-headphones')
    await expect(
      reserve([
        { product_id: await productId('wireless-headphones'), quantity: 1 },
        { product_id: await productId('4k-action-cam'), quantity: 100_000 },
      ]),
    ).rejects.toThrow('insufficient_stock')
    expect(await stock('wireless-headphones')).toBe(before)
  })

  it('takes a size from that size, and refuses a sized product without one', async () => {
    const shirt = await productId('cotton-tshirt')
    const { id: sizeM } = await one<{ id: string }>(
      `select id from product_variants where product_id = $1 and size = 'M'`,
      [shirt],
    )
    const [total, m] = [await stock('cotton-tshirt'), await sizeStock('cotton-tshirt', 'M')]

    await expect(reserve([{ product_id: shirt, quantity: 1 }])).rejects.toThrow('variant_required')
    await reserve([{ product_id: shirt, variant_id: sizeM, quantity: 2 }])

    expect(await sizeStock('cotton-tshirt', 'M')).toBe(m - 2)
    expect(await stock('cotton-tshirt')).toBe(total - 2)
  })

  it('puts units back exactly once, however often release is called', async () => {
    const before = await stock('smart-speaker')
    const id = await reserve([{ product_id: await productId('smart-speaker'), quantity: 3 }])
    expect(await stock('smart-speaker')).toBe(before - 3)

    expect(await release(id)).toBe(true)
    expect(await release(id)).toBe(false)
    expect(await stock('smart-speaker')).toBe(before)
  })

  it('lets one shopper hold at most the capped number of checkouts, taking nothing when refusing', async () => {
    const line = { product_id: await productId('mech-keyboard'), quantity: 1 }
    for (let i = 0; i < 3; i++) await reserve([line], 'owner-cap', 3)
    const before = await stock('mech-keyboard')

    await expect(reserve([line], 'owner-cap', 3)).rejects.toThrow('too_many_reservations')
    expect(await stock('mech-keyboard')).toBe(before)
    // Someone else is unaffected.
    await expect(reserve([line], 'owner-other', 3)).resolves.toBeTruthy()
  })

  it('turns a held reservation into one order, once, without taking the stock twice', async () => {
    const line = { product_id: await productId('bluetooth-earbuds'), quantity: 2 }
    const before = await stock('bluetooth-earbuds')
    const reservationId = await reserve([line])

    const orderId = await recordPaid('cs_test_once', null, [line], reservationId)
    // Stripe redelivers the event.
    const repeat = await recordPaid('cs_test_once', null, [line], reservationId)

    expect(orderId).toBeTruthy()
    expect(repeat).toBeNull()
    const { n } = await one<{ n: number }>(`select count(*)::int as n from orders where stripe_session_id = 'cs_test_once'`)
    expect(n).toBe(1)
    expect(await stock('bluetooth-earbuds')).toBe(before - 2)
    // Sold stock can no longer be "released" back onto the shelf.
    expect(await release(reservationId)).toBe(false)
    expect(await stock('bluetooth-earbuds')).toBe(before - 2)
  })
})

describe('rate limits', () => {
  it('counts per key and refuses past the limit', async () => {
    const hit = async (key: string) =>
      (await one<{ ok: boolean }>('select rate_limit_hit($1, 2, 60) as ok', [key])).ok
    expect([await hit('k1'), await hit('k1'), await hit('k1')]).toEqual([true, true, false])
    expect(await hit('k2')).toBe(true)
  })

  it('purges only windows older than a day', async () => {
    await db.query(`insert into rate_limits values ('stale', now() - interval '2 days', 1)`)
    const { n } = await one<{ n: number }>('select purge_rate_limits() as n')
    expect(n).toBe(1)
    const { left } = await one<{ left: number }>(`select count(*)::int as left from rate_limits where key = 'k1'`)
    expect(left).toBe(1)
  })
})

describe('what the public anon key can reach', () => {
  const serverOnly = [
    `select reserve_stock('[]'::jsonb, 60)`,
    `select release_reservation(gen_random_uuid())`,
    `select release_expired_reservations()`,
    `select extend_reservation(gen_random_uuid(), now())`,
    `select record_paid_order('cs_x', null, null, 0, null, '[]'::jsonb, null)`,
    `select rate_limit_hit('k', 1000, 60)`,
    `select purge_rate_limits()`,
    `select has_bought(gen_random_uuid(), gen_random_uuid())`,
  ]

  it.each(serverOnly)('refuses %s to visitors and signed-in users', async (sql) => {
    const userId = await createUser(db, `caller-${Math.random()}@example.test`)
    await expect(as(db, { role: 'anon' }, (tx) => tx.query(sql))).rejects.toThrow('permission denied')
    await expect(as(db, { role: 'authenticated', userId }, (tx) => tx.query(sql))).rejects.toThrow(
      'permission denied',
    )
  })

  it('does not let a user create a paid order for themselves', async () => {
    const userId = await createUser(db, 'freeloader@example.test')
    await expect(
      as(db, { role: 'authenticated', userId }, (tx) =>
        tx.query(`insert into orders (user_id, total_amount, status) values ($1, 0, 'paid')`, [userId]),
      ),
    ).rejects.toThrow('row-level security')
  })

  it("shows a user their own orders and nobody else's", async () => {
    const buyer = await createUser(db, 'buyer-orders@example.test')
    const other = await createUser(db, 'other-orders@example.test')
    await recordPaid('cs_test_private', buyer, [{ product_id: await productId('smart-speaker'), quantity: 1 }], null)

    const count = (userId: string) =>
      as(db, { role: 'authenticated', userId }, async (tx) =>
        (await tx.query<{ n: number }>(`select count(*)::int as n from orders where stripe_session_id = 'cs_test_private'`))
          .rows[0].n,
      )
    expect(await count(buyer)).toBe(1)
    expect(await count(other)).toBe(0)
  })

  it('hides reservations and rate-limit counters, which hold hashed IPs', async () => {
    const userId = await createUser(db, 'snoop@example.test')
    const read = (table: string) =>
      as(db, { role: 'authenticated', userId }, async (tx) =>
        (await tx.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n,
      )
    expect(await read('stock_reservations')).toBe(0)
    expect(await read('rate_limits')).toBe(0)
  })
})

describe('reviews', () => {
  const writeReview = (userId: string, product: string, extra = '') =>
    as(db, { role: 'authenticated', userId }, (tx) =>
      tx.query(
        `insert into reviews (product_id, user_id, rating, comment${extra ? ', verified_purchase' : ''})
         values ($1, $2, 5, 'Great'${extra ? `, ${extra}` : ''})`,
        [product, userId],
      ),
    )
  const verified = async (userId: string, product: string) =>
    (
      await one<{ v: boolean }>('select verified_purchase as v from reviews where user_id = $1 and product_id = $2', [
        userId,
        product,
      ])
    ).v

  it('ignores a review that claims to be verified without an order', async () => {
    const userId = await createUser(db, 'claimer@example.test')
    const product = await productId('smart-speaker')
    await writeReview(userId, product, 'true')
    expect(await verified(userId, product)).toBe(false)
  })

  it("marks a buyer's review as a verified purchase", async () => {
    const userId = await createUser(db, 'real-buyer@example.test')
    const product = await productId('4k-action-cam')
    await recordPaid('cs_test_review', userId, [{ product_id: product, quantity: 1 }], null)

    await writeReview(userId, product)
    expect(await verified(userId, product)).toBe(true)
  })

  it('does not let the author set the flag by editing', async () => {
    const userId = await createUser(db, 'editor@example.test')
    const product = await productId('mech-keyboard')
    await writeReview(userId, product)

    await expect(
      as(db, { role: 'authenticated', userId }, (tx) =>
        tx.query('update reviews set verified_purchase = true where user_id = $1', [userId]),
      ),
    ).rejects.toThrow('permission denied')
    // Editing what is allowed re-checks, and still finds no order.
    await as(db, { role: 'authenticated', userId }, (tx) =>
      tx.query(`update reviews set comment = 'Changed my mind' where user_id = $1`, [userId]),
    )
    expect(await verified(userId, product)).toBe(false)
  })

  it('caps the comment length in the database too', async () => {
    const userId = await createUser(db, 'novelist@example.test')
    // Outside the transaction: PGlite has one connection, and a query on `db`
    // would wait for the open transaction to finish.
    const product = await productId('wireless-headphones')
    await expect(
      as(db, { role: 'authenticated', userId }, (tx) =>
        tx.query(`insert into reviews (product_id, user_id, rating, comment) values ($1, $2, 4, $3)`, [
          product,
          userId,
          'x'.repeat(2001),
        ]),
      ),
    ).rejects.toThrow('reviews_comment_length')
  })

  it('refuses reviews from visitors who are not signed in', async () => {
    const product = await productId('wireless-headphones')
    await expect(
      as(db, { role: 'anon' }, (tx) =>
        tx.query(`insert into reviews (product_id, user_id, rating) values ($1, gen_random_uuid(), 5)`, [product]),
      ),
    ).rejects.toThrow(/row-level security|permission denied/)
  })
})

describe('catalogue translations', () => {
  it('seeds Spanish and Russian for every demo product and category', async () => {
    const { products, translated } = await one<{ products: number; translated: number }>(
      `select (select count(*)::int from products) as products,
              (select count(distinct product_id)::int from product_translations where locale in ('es', 'ru')) as translated`,
    )
    expect(translated).toBe(products)
    const { n } = await one<{ n: number }>(`select count(*)::int as n from category_translations`)
    expect(n).toBe(6)
  })

  it('lets anyone read them, like the catalogue', async () => {
    const rows = await as(db, { role: 'anon' }, async (tx) =>
      (await tx.query<{ title: string }>(`select title from product_translations where locale = 'ru' limit 1`)).rows,
    )
    expect(rows).toHaveLength(1)
  })

  it('lets only admins change them', async () => {
    const product = await productId('mech-keyboard')
    const shopper = await createUser(db, 'translator@example.test')
    await expect(
      as(db, { role: 'authenticated', userId: shopper }, (tx) =>
        tx.query(`update product_translations set title = 'hacked' where product_id = $1 returning 1`, [product]),
      ).then((r) => r.rows.length),
    ).resolves.toBe(0)
    await expect(
      as(db, { role: 'anon' }, (tx) =>
        tx.query(`insert into product_translations (product_id, locale, title) values ($1, 'es', 'x')`, [product]),
      ),
    ).rejects.toThrow(/row-level security|duplicate key/)

    const admin = await createUser(db, 'admin-translator@example.test')
    await db.query(`update profiles set role = 'admin' where id = $1`, [admin])
    const updated = await as(db, { role: 'authenticated', userId: admin }, (tx) =>
      tx.query(`update product_translations set title = 'Teclado' where product_id = $1 and locale = 'es' returning 1`, [
        product,
      ]),
    )
    expect(updated.rows).toHaveLength(1)
  })

  it('accepts only the translated languages', async () => {
    await expect(
      db.query(`insert into product_translations (product_id, locale, title) values ($1, 'en', 'x')`, [
        await productId('smart-speaker'),
      ]),
    ).rejects.toThrow('check constraint')
  })
})

describe('saving translations from the admin forms', () => {
  let admin: string
  let category: string

  beforeAll(async () => {
    admin = await createUser(db, 'admin-forms@example.test')
    await db.query(`update profiles set role = 'admin' where id = $1`, [admin])
    category = (await one<{ id: string }>(`select id from categories where slug = 'electronics'`)).id
  })

  const saveProduct = (id: string | null, translations: unknown, title = 'Desk Lamp') =>
    as(db, { role: 'authenticated', userId: admin }, async (tx) =>
      (
        await tx.query<{ id: string }>(`select save_product($1, $2::jsonb, null, $3::jsonb) as id`, [
          id,
          JSON.stringify({ title, slug: `lamp-${Math.random().toString(36).slice(2, 8)}`, description: 'A lamp', price: 30, inventory_count: 4, category_id: category, image_urls: [] }),
          translations === null ? null : JSON.stringify(translations),
        ])
      ).rows[0].id,
    )
  const translationsOf = async (productId: string) =>
    (await db.query<{ locale: string; title: string; description: string | null }>(
      `select locale, title, description from product_translations where product_id = $1 order by locale`,
      [productId],
    )).rows

  it('saves a product together with its translations', async () => {
    const id = await saveProduct(null, { es: { title: 'Lámpara', description: 'Una lámpara' }, ru: { title: '', description: '' } })
    expect(await translationsOf(id)).toEqual([{ locale: 'es', title: 'Lámpara', description: 'Una lámpara' }])
  })

  it('removes a translation whose name is cleared, and leaves unsent languages alone', async () => {
    const id = await saveProduct(null, { es: { title: 'Lámpara', description: '' }, ru: { title: 'Лампа', description: '' } })
    await saveProduct(id, { es: { title: '', description: '' } })
    expect(await translationsOf(id)).toEqual([{ locale: 'ru', title: 'Лампа', description: null }])
  })

  it('keeps translated specifications the form does not edit', async () => {
    const product = await productId('wireless-headphones')
    await saveProduct(product, { es: { title: 'Auriculares', description: 'Nuevos' } }, 'Wireless Noise-Canceling Headphones')
    const { attributes } = await one<{ attributes: Record<string, string> }>(
      `select attributes from product_translations where product_id = $1 and locale = 'es'`,
      [product],
    )
    expect(attributes.color).toBe('Negro')
  })

  it('is all or nothing: a bad translation leaves no product behind', async () => {
    const before = (await one<{ n: number }>(`select count(*)::int as n from products`)).n
    await expect(saveProduct(null, { es: { title: 'x'.repeat(201), description: '' } })).rejects.toThrow('check constraint')
    expect((await one<{ n: number }>(`select count(*)::int as n from products`)).n).toBe(before)
  })

  it('saves a category and its translations in one call, for admins only', async () => {
    const fields = JSON.stringify({ name: 'Garden', slug: 'garden', description: 'Outdoor things', image_url: '' })
    const translations = JSON.stringify({ es: { title: 'Jardín', description: '' }, ru: { title: 'Сад', description: 'Для дачи' } })
    const id = await as(db, { role: 'authenticated', userId: admin }, async (tx) =>
      (await tx.query<{ id: string }>(`select save_category(null, $1::jsonb, $2::jsonb) as id`, [fields, translations])).rows[0].id,
    )
    const rows = (await db.query(`select locale, name from category_translations where category_id = $1 order by locale`, [id])).rows
    expect(rows).toEqual([{ locale: 'es', name: 'Jardín' }, { locale: 'ru', name: 'Сад' }])

    const shopper = await createUser(db, 'not-admin@example.test')
    await expect(
      as(db, { role: 'authenticated', userId: shopper }, (tx) =>
        tx.query(`select save_category(null, $1::jsonb, null)`, [fields.replace('garden', 'garden-2')]),
      ),
    ).rejects.toThrow('forbidden')
  })
})

describe('support requests', () => {
  const file = (email: string) =>
    db.query(`insert into support_requests (email, message, transcript) values ($1, 'help', '[]'::jsonb)`, [email])

  it('cannot be written or read from the browser, signed in or not', async () => {
    const shopper = await createUser(db, 'support-shopper@example.test')
    await file('private@example.test')

    for (const caller of [{ role: 'anon' as const }, { role: 'authenticated' as const, userId: shopper }]) {
      await expect(
        as(db, caller, (tx) => tx.query(`insert into support_requests (email, message) values ('x@y.z', 'spam')`)),
      ).rejects.toThrow('row-level security')
      const seen = await as(db, caller, async (tx) =>
        (await tx.query<{ n: number }>(`select count(*)::int as n from support_requests`)).rows[0].n,
      )
      expect(seen).toBe(0)
    }
  })

  it('lets admins read and resolve them', async () => {
    const admin = await createUser(db, 'support-admin@example.test')
    await db.query(`update profiles set role = 'admin' where id = $1`, [admin])
    await file('resolve-me@example.test')

    const resolved = await as(db, { role: 'authenticated', userId: admin }, (tx) =>
      tx.query(`update support_requests set status = 'resolved' where email = 'resolve-me@example.test' returning 1`),
    )
    expect(resolved.rows).toHaveLength(1)
  })

  it('bounds what a row can hold', async () => {
    await expect(
      db.query(`insert into support_requests (email, message) values ('a@b.c', $1)`, ['x'.repeat(2001)]),
    ).rejects.toThrow('check constraint')
    await expect(
      db.query(`insert into support_requests (email, message, transcript) values ('a@b.c', 'hi', '{}'::jsonb)`),
    ).rejects.toThrow('check constraint')
  })
})
