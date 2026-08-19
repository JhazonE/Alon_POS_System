const mysql = require('mysql2/promise');
async function run() {
  const c = await mysql.createConnection({host:'localhost', user:'root', password:'rootpassword', database:'alon_pos', port:3306});
  try {
    await c.execute(`UPDATE sales_invoices SET amount_paid = total WHERE status = 'Paid'`);
    console.log('✅ Updated existing records');
  } catch(e) {
    console.log('Error updating: ' + e.message);
  }
  c.end();
}
run();
