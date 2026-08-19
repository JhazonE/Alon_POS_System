import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../lib/mysql';

// POST endpoint to send product data to external APIs
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetUrl, productIds, headers = {} } = body;

    if (!targetUrl) {
      return NextResponse.json(
        { success: false, error: 'targetUrl is required' },
        { status: 400 }
      );
    }

    // Get product data from database
    let sql = `
      SELECT
        id,
        name,
        description,
        category,
        brand,
        stock,
        price,
        cost,
        sku,
        barcode,
        created_at,
        updated_at
      FROM products
    `;

    const params: any[] = [];

    if (productIds && productIds.length > 0) {
      // Send specific products
      const placeholders = productIds.map(() => '?').join(',');
      sql += ` WHERE id IN (${placeholders})`;
      params.push(...productIds);
    }

    const products = await query(sql, params);

    if (products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No products found' },
        { status: 404 }
      );
    }

    console.log(`Sending ${products.length} products to:`, targetUrl);

    // Send data to external API
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        source: 'alon_pos',
        timestamp: new Date().toISOString(),
        products: products,
        totalProducts: products.length
      }),
    });

    const responseData = response.ok ? await response.json().catch(() => null) : null;

    return NextResponse.json({
      success: true,
      message: `${products.length} products sent successfully`,
      targetUrl,
      status: response.status,
      productsCount: products.length,
      responseData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error sending products:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send products' },
      { status: 500 }
    );
  }
}

// GET endpoint to see available products for sending
export async function GET() {
  try {
    const products = await query(`
      SELECT
        id,
        name,
        category,
        brand,
        stock,
        price
      FROM products
      ORDER BY created_at DESC
      LIMIT 10
    `);

    return NextResponse.json({
      success: true,
      message: 'Available products to send',
      products: products.map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        stock: p.stock,
        price: p.price
      })),
      usage: {
        endpoint: 'POST /api/send-products',
        body: {
          targetUrl: 'https://your-other-app.com/api/products',
          productIds: ['optional-array-of-ids'],
          headers: { 'Authorization': 'Bearer token' }
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}
