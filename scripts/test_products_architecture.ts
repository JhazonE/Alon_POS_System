import fetch from 'node-fetch';

async function testProductsAPI() {
  const baseUrl = 'http://localhost:3000/api/products';
  
  console.log('Testing GET products...');
  try {
    const getResponse = await fetch(`${baseUrl}?limit=5`);
    const getData: any = await getResponse.json();
    
    if (getData.success) {
      console.log('✅ GET products successful');
      console.log(`Found ${getData.data.length} products`);
    } else {
      console.error('❌ GET products failed', getData.error);
    }
  } catch (error: any) {
    console.error('❌ GET products error:', error.message);
  }

  console.log('\nTesting POST product...');
  const newProduct = {
    name: 'Clean Arch Test Product',
    description: 'A product created during architecture refactor',
    category: 'Test',
    brand: 'Antigravity',
    price: 99.99,
    stock: 10
  };

  try {
    const postResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProduct)
    });
    const postData: any = await postResponse.json();

    if (postData.success) {
      console.log('✅ POST product successful');
      console.log('Created ID:', postData.data.id);
    } else {
      console.error('❌ POST product failed', postData.error);
    }
  } catch (error: any) {
    console.error('❌ POST product error:', error.message);
  }
}

testProductsAPI();
