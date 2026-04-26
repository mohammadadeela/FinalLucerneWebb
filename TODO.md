# Task Progress: Customer/Order SQL Queries + Schema Fix

## Completed ✅
- [x] Analyzed schema (users, orders tables confirmed)
- [x] Fixed `delivered_at` error (ALTER TABLE with IF NOT EXISTS)
- [x] Created demo SQL queries:
  | Query | Description |
  |-------|-------------|
  | INSERT users | Add customer "John Doe" (customer@example.com) |
  | INSERT orders + order_items | Add order with demo T-Shirt product |
- [x] Created `demo-customer-order.sql` - **complete safe script**
- [x] Included all CREATE/ALTER IF NOT EXISTS

## Next Steps ⏳
1. **Run the SQL**: Open `demo-customer-order.sql` in pgAdmin/DBeaver/VSCode → Execute All
2. **Verify**: Check `SELECT * FROM users WHERE email='customer@example.com';`
3. **Done** 🎉

**To test in your DB terminal:**
```bash
psql -d your_database -f demo-customer-order.sql
```

