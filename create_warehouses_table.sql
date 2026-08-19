USE alon_pos;

CREATE TABLE IF NOT EXISTS warehouses (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  location VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO warehouses (id, name, location, is_active) VALUES
('wh_main', 'Main Warehouse', 'Building A, Floor 1', TRUE),
('wh_secondary', 'Secondary Warehouse', 'Building B, Floor 2', TRUE),
('wh_distribution', 'Distribution Center', 'Building C, Ground Floor', TRUE);
