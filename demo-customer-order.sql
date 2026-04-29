-- ============================================================
-- Lucerne Boutique: Customer + Order Demo + delivered_at Fix
-- ============================================================

-- ─────────────────────────────────────────
-- STEP 1: Fix the ERROR - Add missing delivered_at column
-- ─────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at timestamp;

-- ─────────────────────────────────────────
-- STEP 2: Create minimal supporting data (category + product)
-- ─────────────────────────────────────────
INSERT INTO categories (name, slug) 
VALUES ('Clothing', 'clothing') 
ON CONFLICT (slug) DO NOTHING;

INSERT INTO subcategories (name, slug, category_id) 
SELECT 'T-Shirts', 't-shirts', id FROM categories WHERE slug = 'clothing'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO products (name, description, price, main_image, category_id, subcategory_id, stock_quantity) 
SELECT 
  'Demo T-Shirt', 
  'Comfortable cotton t-shirt for testing', 
  25.99, 
  'https://via.placeholder.com/300x400?text=T-Shirt', 
  c.id, 
  s.id, 
  100
FROM categories c 
JOIN subcategories s ON s.category_id = c.id
WHERE c.slug = 'clothing' AND s.slug = 't-shirts'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────
-- STEP 3: ADD CUSTOMER USER
-- Query: INSERT INTO users(email, password, role, full_name, phone, address)
-- ─────────────────────────────────────────
INSERT INTO users (email, password, role, full_name, phone, address) 
VALUES (
  'customer@example.com', 
  '$2b$10$hashedpasswordhere',  -- Use bcrypt hash in production
  'customer',
  'John Doe',
  '+1234567890',
  '123 Main St, City, Country'
)
ON CONFLICT (email) DO NOTHING;

-- Get the customer ID (should be the last inserted)
SELECT id, email, full_name FROM users WHERE email = 'customer@example.com';

-- ─────────────────────────────────────────
-- STEP 4: ADD ORDER FOR SAME CUSTOMER
-- Query: INSERT INTO orders + order_items
-- ─────────────────────────────────────────
DO \$\$
DECLARE
  customer_id integer;
  product_id integer;
  order_id integer;
BEGIN
  -- Get customer and product IDs
  SELECT id INTO customer_id FROM users WHERE email = 'customer@example.com';
  SELECT id INTO product_id FROM products WHERE name = 'Demo T-Shirt';
  
  IF customer_id IS NOT NULL AND product_id IS NOT NULL THEN
    -- Insert order
    INSERT INTO orders (
      user_id, total_amount, shipping_cost, 
      full_name, phone, address, city, payment_method, status
    ) VALUES (
      customer_id, 25.99, 5.00,
      'John Doe', '+1234567890', '123 Main St', 'City',
      'Cash on delivery', 'Pending'
    ) RETURNING id INTO order_id;
    
    -- Insert order item
    INSERT INTO order_items (order_id, product_id, quantity, price)
    VALUES (order_id, product_id, 1, 25.99);
    
    -- Example: Mark as delivered (optional)
    UPDATE orders SET delivered_at = now() WHERE id = order_id;
    
    RAISE NOTICE '✅ Order created! ID: %, Customer: %, Total: $25.99', order_id, customer_id;
  ELSE
    RAISE NOTICE '❌ Customer or product not found';
  END IF;
END;
\$\$;

-- ─────────────────────────────────────────
-- STEP 5: VIEW RESULTS
-- ─────────────────────────────────────────
SELECT 
  u.full_name AS customer,
  o.id AS order_id,
  o.total_amount,
  o.status,
  o.delivered_at,
  oi.quantity,
  p.name AS product
FROM orders o
JOIN users u ON o.user_id = u.id
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id
WHERE u.email = 'customer@example.com';

-- All customers
SELECT id, email, full_name, created_at FROM users ORDER BY created_at DESC LIMIT 5;

-- All recent orders
SELECT id, user_id, total_amount, status, delivered_at FROM orders ORDER BY created_at DESC LIMIT 5;

-- ============================================================
-- ✅ Done! Tables safe with IF NOT EXISTS. Customer + order added.
-- Run this entire script in your PostgreSQL client.
-- ============================================================

