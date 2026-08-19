const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
dotenv.config();

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'alon_pos'
  });

  try {
    console.log('Creating approval_workflows table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS approval_workflows (
        id VARCHAR(36) PRIMARY KEY,
        transaction_type VARCHAR(50) NOT NULL,
        user_type_id VARCHAR(36) NOT NULL,
        step_order INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating approval_queue table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS approval_queue (
        id VARCHAR(36) PRIMARY KEY,
        transaction_type VARCHAR(50) NOT NULL,
        transaction_data JSON NOT NULL,
        status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
        current_step INT DEFAULT 1,
        created_by VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating approval_history table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS approval_history (
        id VARCHAR(36) PRIMARY KEY,
        approval_queue_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        action ENUM('Approve', 'Reject') NOT NULL,
        notes TEXT,
        step_number INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize the default workflow as requested: 
    // Inventory Man > Merchandise Users > Audit Users > General Manager
    
    // 1. Get role IDs
    const roles = ['Inventory Man', 'Merchandise Users', 'Audit Users', 'General Manager'];
    const workflowSteps = [];
    
    for (let i = 0; i < roles.length; i++) {
      const [rows] = await pool.query('SELECT id FROM user_types WHERE name = ?', [roles[i]]);
      if (rows.length > 0) {
        workflowSteps.push({
          roleId: rows[0].id,
          stepOrder: i + 1
        });
      }
    }

    if (workflowSteps.length === 4) {
      console.log('Initializing default workflow for STOCK_ADJUSTMENT and PURCHASE_ORDER...');
      const txTypes = ['STOCK_ADJUSTMENT', 'STOCK_TRANSFER', 'PURCHASE_ORDER', 'RECEIVE_PO'];
      
      for (const txType of txTypes) {
        // Clear existing workflow for this type to avoid duplicates
        await pool.query('DELETE FROM approval_workflows WHERE transaction_type = ?', [txType]);
        
        for (const step of workflowSteps) {
          await pool.query(
            'INSERT INTO approval_workflows (id, transaction_type, user_type_id, step_order) VALUES (?, ?, ?, ?)',
            [uuidv4(), txType, step.roleId, step.stepOrder]
          );
        }
      }
    } else {
        console.warn('Could not find all 4 roles. Found: ' + workflowSteps.length);
    }

    console.log('Database initialization complete.');
  } catch (error) {
    console.error('Initialization failed:', error);
  } finally {
    await pool.end();
  }
}

run();
