import pg from 'pg';
import { fileURLToPath } from 'url';
import path from 'path';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const queries = [
  // Step 1: Add missing delivered_at column
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at timestamp;`,

  // Step 2a: Create category
  `INSERT INTO categories (name, slug) VALUES ('Clothing', 'clothing') ON CONFLICT (slug) DO NOTHING;`,

  // Step 2b: Create subcategory
  `INSERT INTO subcategories (name, slug, category_id)
   SELECT 'T-Shirts', 't-shirts', id FROM categories WHERE slug = 'clothing'
   ON CONFLICT (slug) DO NOTHING;`,

  // Step 2c: Create product
  `INSERT INTO products (name, description, price, main_image, category_id, subcategory_id, stock_quantity)
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
   ON CONFLICT DO NOTHING;`,

  // Step 3: Add customer user
  `INSERT INTO users (email, password, role, full_name, phone, address)
   VALUES (
     'testcustomer@lucerne.com',
     'plaintext_password_123',
     'customer',
     'Test Customer',
     '+970599999999',
     'Palestine Street, Ramallah'
   )
   ON CONFLICT (email) DO NOTHING;`,
];

async function runDemo() {
  try {
    console.log('📊 Connecting to database...');
    const client = await pool.connect();

    console.log('🚀 Running setup queries...\n');

    for (const query of queries) {
      try {
        await client.query(query);
        console.log('✅', query.substring(0, 50) + '...');
      } catch (err) {
        console.log('⚠️ ', err.message.substring(0, 60));
      }
    }

    // Now add the order with PL/pgSQL
    const orderQuery = `
    DO $$
    DECLARE
      customer_id integer;
      product_id integer;
      order_id integer;
    BEGIN
      SELECT id INTO customer_id FROM users WHERE email = 'testcustomer@lucerne.com';
      SELECT id INTO product_id FROM products WHERE name = 'Demo T-Shirt';

      IF customer_id IS NOT NULL AND product_id IS NOT NULL THEN
        INSERT INTO orders (
          user_id, total_amount, shipping_cost,
          full_name, phone, address, city, payment_method, status
        ) VALUES (
          customer_id, 30.99, 5.00,
          'Test Customer', '+970599999999', 'Palestine Street', 'Ramallah',
          'Cash on delivery', 'Pending'
        ) RETURNING id INTO order_id;

        INSERT INTO order_items (order_id, product_id, quantity, price)
        VALUES (order_id, product_id, 1, 25.99);

        UPDATE orders SET delivered_at = now() WHERE id = order_id;
      END IF;
    END $$;
    `;

    await client.query(orderQuery);
    console.log('✅ Order created successfully');

    // Verify
    const result = await client.query(`
      SELECT
        u.full_name AS customer,
        u.email,
        o.id AS order_id,
        o.total_amount,
        o.status,
        p.name AS product,
        oi.quantity
      FROM orders o
      JOIN users u ON o.user_id = u.id
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE u.email = 'testcustomer@lucerne.com'
      LIMIT 1;
    `);

    console.log('\n✅ Demo data loaded successfully!\n');
    console.log('📋 Test User Created:');
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log(`   Email: ${row.email}`);
      console.log(`   Name: ${row.customer}`);
      console.log(`   Order ID: ${row.order_id}`);
      console.log(`   Product: ${row.product} (Qty: ${row.quantity})`);
      console.log(`   Total: ₪${row.total_amount}`);
      console.log(`   Status: ${row.status}`);
    }

    client.release();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runDemo();
