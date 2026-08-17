-- "Buy more" orders placed by consumers from the public GS1 verify page
-- (/auth/:code -> "Buy more" button). Each order snapshots the chosen
-- gs1_size_specs rows as plain text (spec/size_spec/product_line) so the
-- order stays readable even if the reference row is later edited or deleted;
-- size_spec_id is kept as a best-effort link back to that row.
CREATE TABLE IF NOT EXISTS orders (
    id            BIGSERIAL PRIMARY KEY,
    brand_id      BIGINT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    label_id      BIGINT REFERENCES gs1_labels(id) ON DELETE SET NULL,
    customer_name VARCHAR(150) NOT NULL,
    phone         VARCHAR(30) NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'new',
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
    id            BIGSERIAL PRIMARY KEY,
    order_id      BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    size_spec_id  BIGINT REFERENCES gs1_size_specs(id) ON DELETE SET NULL,
    spec          VARCHAR(100) NOT NULL,
    size_spec     VARCHAR(100),
    product_line  VARCHAR(100),
    quantity      INT NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_brand ON orders (brand_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
