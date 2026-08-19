# MySQL Database Setup for Alon POS

## Prerequisites
- MySQL Server installed and running (version 8.0+ recommended)
- MySQL client tools

## Windows Setup

### 1. Start MySQL Service
If MySQL is installed but not running:

1. Open Services (services.msc)
2. Find "MySQL80" (or your MySQL service)
3. Right-click and select "Start"

### 2. Alternative: Command Line
```bash
net start mysql80
```

### 3. Log into MySQL as root
```bash
mysql -u root -p
```

### 4. Create Database User (Optional but recommended)
```sql
CREATE USER 'alon_pos'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON alon_pos.* TO 'alon_pos'@'localhost';
FLUSH PRIVILEGES;
```

### 5. Create Database and Tables
Run the seed script:
```bash
npm run seed
```

## Environment Variables
Update your `.env` file if you created a custom user:

```env
DB_HOST=localhost
DB_USER=alon_pos  # or 'root' if using root
DB_PASSWORD=your_password  # or '' for root with no password
DB_NAME=alon_pos
```

## Troubleshooting

### Access Denied Errors
- Ensure MySQL service is running
- Check credentials in `.env`
- For root user, password might be blank or you may need to reset it

### MySQL Not Found
- Verify MySQL installation: `mysql --version`
- Ensure MySQL bin directory is in PATH
- You may need to use full path: `"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql"`

### Connection Issues
- Check if port 3306 is open and not blocked by firewall
- Verify MySQL is configured to allow connections from localhost

## Manual Database Creation
If the seed script fails, you can create tables manually:

```sql
-- Create database
CREATE DATABASE alon_pos;
USE alon_pos;

-- Create tables (see scripts/seed.ts for full schema)
CREATE TABLE products (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  additional_description TEXT,
  category VARCHAR(100),
  brand VARCHAR(100),
  subcategory VARCHAR(100),
  stock INT DEFAULT 0,
  reorder_point INT DEFAULT 0,
  avg_daily_sales DECIMAL(10,2) DEFAULT 0,
  price DECIMAL(10,2) NOT NULL,
  cost DECIMAL(10,2),
  sku VARCHAR(100) UNIQUE,
  barcode VARCHAR(100),
  image_url VARCHAR(500),
  image_hint VARCHAR(255),
  is_serialized BOOLEAN DEFAULT FALSE,
  unit_of_measure VARCHAR(50),
  parent_id VARCHAR(50),
  conversion_factor DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES products(id)
);

-- Create supporting tables (brands, categories, etc.)
-- See scripts/seed.ts for complete schema
```

## Testing
Once MySQL is set up, test the application:

1. Start the development server: `npm run dev`
2. Navigate to Products section
3. Try adding a new product
4. Check database to verify the product was saved
