const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'rootpassword',
    database: 'alon_pos'
  });

  // Update pending logs to use the new endpoint
  const [updateResult] = await connection.query(
    "UPDATE external_api_logs SET endpoint = 'https://verdix-production-52df.up.railway.app/api/sync/push' WHERE status = 'pending'"
  );
  console.log('Update Result:', updateResult);

  const [rows] = await connection.query('SELECT transaction_type, endpoint, status, error_message, created_at FROM external_api_logs ORDER BY created_at DESC LIMIT 5');
  console.log('Logs after update:', JSON.stringify(rows, null, 2));

  await connection.end();
}

main().catch(console.error);
