
import { query } from '../lib/mysql';
import Papa from 'papaparse';

async function run() {
  try {
    console.log('Fetching products...');
    const products = await query(`
      SELECT 
        id, 
        name, 
        barcode, 
        stock as stock_quantity,
        reorder_point,
        cost as cost_price,
        price as selling_price,
        unit_of_measure as unit
      FROM products
      LIMIT 5
    `);
    
    console.log('Products fetched:', products.length);
    console.log('First product:', products[0]);

    console.log('Unparsing to CSV...');
    const csv = Papa.unparse(products);
    console.log('CSV generated successfully:');
    console.log(csv);

  } catch (error) {
    console.error('Error in debug script:', error);
  } finally {
    process.exit(0);
  }
}

run();
