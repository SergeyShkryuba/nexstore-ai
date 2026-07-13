-- Очистка старых данных (если есть)
DELETE FROM products;
DELETE FROM categories;

-- 1. Добавление категорий
INSERT INTO categories (id, name, slug, description) VALUES 
('11111111-1111-1111-1111-111111111111', 'Electronics', 'electronics', 'Gadgets and electronic devices'),
('22222222-2222-2222-2222-222222222222', 'Clothing', 'clothing', 'Apparel and accessories'),
('33333333-3333-3333-3333-333333333333', 'Smart Home', 'smart-home', 'Home automation devices');

-- 2. Добавление товаров
INSERT INTO products (id, category_id, title, slug, description, price, inventory_count, image_urls, attributes) VALUES
-- Electronics
('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Wireless Noise-Canceling Headphones', 'wireless-headphones', 'Premium noise-canceling headphones with 30-hour battery life and spatial audio support. Perfect for travel and focused work.', 299.99, 50, ARRAY['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80'], '{"color": "Black", "connectivity": "Bluetooth 5.2"}'::jsonb),
('00000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '4K Action Camera', '4k-action-cam', 'Rugged, waterproof action camera capable of shooting 4K video at 60fps. Includes mounting accessories.', 199.50, 20, ARRAY['https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&q=80'], '{"resolution": "4K", "waterproof": "Up to 10m"}'::jsonb),
('00000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Mechanical Keyboard', 'mech-keyboard', 'RGB mechanical gaming keyboard with tactile switches and customizable macros.', 129.99, 100, ARRAY['https://images.unsplash.com/photo-1595225476474-87563907a212?w=800&q=80'], '{"switches": "Tactile", "layout": "US ANSI"}'::jsonb),

-- Clothing
('00000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'Minimalist Cotton T-Shirt', 'cotton-tshirt', 'Ultra-soft, 100% organic cotton t-shirt. Breathable and perfect for everyday wear.', 24.99, 200, ARRAY['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80'], '{"color": "White", "size": "M"}'::jsonb),
('00000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'Classic Denim Jacket', 'denim-jacket', 'Vintage-wash denim jacket with copper hardware and a relaxed fit.', 89.99, 45, ARRAY['https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=800&q=80'], '{"color": "Blue", "size": "L"}'::jsonb),

-- Smart Home
('00000000-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 'Smart Speaker with Voice Assistant', 'smart-speaker', 'Compact smart speaker with rich sound and built-in voice assistant for smart home control.', 49.99, 150, ARRAY['https://images.unsplash.com/photo-1543512214-318c7553f230?w=800&q=80'], '{"color": "Charcoal", "voice_assistant": "Included"}'::jsonb),
('00000000-0000-0000-0000-000000000007', '33333333-3333-3333-3333-333333333333', 'Wi-Fi Smart Thermostat', 'smart-thermostat', 'Energy-saving smart thermostat that learns your habits and can be controlled via smartphone.', 199.00, 30, ARRAY['https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&q=80'], '{"connectivity": "Wi-Fi", "power": "C-wire required"}'::jsonb);
