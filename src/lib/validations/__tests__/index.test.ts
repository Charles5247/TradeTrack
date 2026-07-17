import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  createUserSchema,
  updateUserSchema,
  productSchema,
  categorySchema,
  supplierSchema,
  warehouseSchema,
  inventoryAdjustmentSchema,
  warehouseTransferSchema,
  saleSchema,
  vendorTransactionSchema,
  organizationSchema,
} from '../index';

describe('loginSchema', () => {
  it('accepts a valid email and password', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: 'password123' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'password123' });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 6 characters', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: '123' });
    expect(result.success).toBe(false);
  });

  it('allows the optional remember field to be omitted', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: 'password123' });
    expect(result.success).toBe(true);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'user@example.com' }).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'invalid' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts matching passwords of sufficient length', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'longenough1',
      confirmPassword: 'longenough1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects mismatched passwords', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'longenough1',
      confirmPassword: 'different1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['confirmPassword']);
    }
  });

  it('rejects passwords shorter than 8 characters', () => {
    const result = resetPasswordSchema.safeParse({ password: 'short', confirmPassword: 'short' });
    expect(result.success).toBe(false);
  });
});

describe('createUserSchema', () => {
  it('accepts a fully valid payload for each of the 5 roles', () => {
    const roles = ['super_admin', 'owner', 'admin', 'manager', 'cashier'] as const;
    for (const role of roles) {
      const result = createUserSchema.safeParse({
        email: 'newuser@example.com',
        full_name: 'Jane Doe',
        role,
        password: 'password123',
      });
      expect(result.success, `role "${role}" should be valid`).toBe(true);
    }
  });

  it('rejects an invalid role', () => {
    const result = createUserSchema.safeParse({
      email: 'newuser@example.com',
      full_name: 'Jane Doe',
      role: 'not_a_real_role',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a full_name shorter than 2 characters', () => {
    const result = createUserSchema.safeParse({
      email: 'newuser@example.com',
      full_name: 'J',
      role: 'cashier',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateUserSchema', () => {
  it('accepts owner and manager roles (regression test for role-gap bug)', () => {
    expect(updateUserSchema.safeParse({ role: 'owner' }).success).toBe(true);
    expect(updateUserSchema.safeParse({ role: 'manager' }).success).toBe(true);
  });

  it('accepts a partial update with only status', () => {
    expect(updateUserSchema.safeParse({ status: 'suspended' }).success).toBe(true);
  });

  it('rejects an invalid status', () => {
    expect(updateUserSchema.safeParse({ status: 'banned' }).success).toBe(false);
  });
});

describe('productSchema', () => {
  const validProduct = {
    name: 'Test Product',
    sku: 'SKU-001',
    selling_price: 100,
    cost_price: 50,
  };

  it('accepts a minimal valid product', () => {
    expect(productSchema.safeParse(validProduct).success).toBe(true);
  });

  it('defaults status to "active" when omitted', () => {
    const result = productSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('active');
    }
  });

  it('coerces string numeric prices to numbers', () => {
    const result = productSchema.safeParse({
      ...validProduct,
      selling_price: '150',
      cost_price: '75',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selling_price).toBe(150);
      expect(result.data.cost_price).toBe(75);
    }
  });

  it('rejects a negative selling price', () => {
    const result = productSchema.safeParse({ ...validProduct, selling_price: -10 });
    expect(result.success).toBe(false);
  });

  it('rejects a missing SKU', () => {
    const result = productSchema.safeParse({ ...validProduct, sku: '' });
    expect(result.success).toBe(false);
  });
});

describe('categorySchema', () => {
  it('accepts a valid category', () => {
    expect(categorySchema.safeParse({ name: 'Electronics' }).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(categorySchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('supplierSchema', () => {
  it('accepts a valid supplier with all optional fields', () => {
    const result = supplierSchema.safeParse({
      name: 'Acme Supplies',
      phone: '08012345678',
      email: 'acme@example.com',
      address: '123 Market St',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty string for email (optional-or-empty pattern)', () => {
    expect(supplierSchema.safeParse({ name: 'Acme', email: '' }).success).toBe(true);
  });

  it('rejects an invalid email when non-empty', () => {
    expect(supplierSchema.safeParse({ name: 'Acme', email: 'not-an-email' }).success).toBe(false);
  });
});

describe('warehouseSchema', () => {
  it('accepts a valid warehouse and defaults is_main to false', () => {
    const result = warehouseSchema.safeParse({ name: 'Main Warehouse' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_main).toBe(false);
    }
  });

  it('rejects an empty name', () => {
    expect(warehouseSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('inventoryAdjustmentSchema', () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000';

  it('accepts a valid adjustment', () => {
    const result = inventoryAdjustmentSchema.safeParse({
      product_id: uuid,
      warehouse_id: uuid,
      quantity: 10,
      movement_type: 'in',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-integer quantity', () => {
    const result = inventoryAdjustmentSchema.safeParse({
      product_id: uuid,
      warehouse_id: uuid,
      quantity: 10.5,
      movement_type: 'in',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid movement_type', () => {
    const result = inventoryAdjustmentSchema.safeParse({
      product_id: uuid,
      warehouse_id: uuid,
      quantity: 10,
      movement_type: 'teleport',
    });
    expect(result.success).toBe(false);
  });
});

describe('warehouseTransferSchema', () => {
  const uuidA = '123e4567-e89b-12d3-a456-426614174000';
  const uuidB = '223e4567-e89b-12d3-a456-426614174000';

  it('accepts a valid transfer between two different warehouses', () => {
    const result = warehouseTransferSchema.safeParse({
      from_warehouse_id: uuidA,
      to_warehouse_id: uuidB,
      product_id: uuidA,
      quantity: 5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a transfer where from and to warehouses are the same', () => {
    const result = warehouseTransferSchema.safeParse({
      from_warehouse_id: uuidA,
      to_warehouse_id: uuidA,
      product_id: uuidA,
      quantity: 5,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['to_warehouse_id']);
    }
  });

  it('rejects a quantity less than 1', () => {
    const result = warehouseTransferSchema.safeParse({
      from_warehouse_id: uuidA,
      to_warehouse_id: uuidB,
      product_id: uuidA,
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('saleSchema', () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000';

  it('accepts a valid sale with at least one item', () => {
    const result = saleSchema.safeParse({
      warehouse_id: uuid,
      payment_method: 'cash',
      amount_paid: 1000,
      items: [{ product_id: uuid, quantity: 2, unit_price: 500, warehouse_id: uuid }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a sale with zero items', () => {
    const result = saleSchema.safeParse({
      warehouse_id: uuid,
      payment_method: 'cash',
      amount_paid: 1000,
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid payment_method', () => {
    const result = saleSchema.safeParse({
      warehouse_id: uuid,
      payment_method: 'crypto',
      amount_paid: 1000,
      items: [{ product_id: uuid, quantity: 1, unit_price: 500, warehouse_id: uuid }],
    });
    expect(result.success).toBe(false);
  });

  it('defaults discount and tax to 0 when omitted', () => {
    const result = saleSchema.safeParse({
      warehouse_id: uuid,
      payment_method: 'transfer',
      amount_paid: 500,
      items: [{ product_id: uuid, quantity: 1, unit_price: 500, warehouse_id: uuid }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discount).toBe(0);
      expect(result.data.tax).toBe(0);
    }
  });
});

describe('vendorTransactionSchema', () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000';

  it('accepts a valid vendor transaction', () => {
    const result = vendorTransactionSchema.safeParse({
      vendor_name: 'Vendor A',
      date_issued: '2026-07-17',
      items: [{ product_id: uuid, quantity: 3, unit_price: 200 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing vendor_name', () => {
    const result = vendorTransactionSchema.safeParse({
      vendor_name: '',
      date_issued: '2026-07-17',
      items: [{ product_id: uuid, quantity: 3, unit_price: 200 }],
    });
    expect(result.success).toBe(false);
  });
});

describe('organizationSchema', () => {
  it('accepts a minimal valid organization and applies defaults', () => {
    const result = organizationSchema.safeParse({ name: 'Demo Store' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('NGN');
      expect(result.data.timezone).toBe('Africa/Lagos');
    }
  });

  it('accepts a custom currency', () => {
    const result = organizationSchema.safeParse({ name: 'Demo Store', currency: 'USD' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('USD');
    }
  });

  it('rejects a name shorter than 2 characters', () => {
    expect(organizationSchema.safeParse({ name: 'A' }).success).toBe(false);
  });
});
