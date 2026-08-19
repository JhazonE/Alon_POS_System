// Test script to demonstrate POSTing data to external APIs
// Run with: node test_post_to_external.js

const data = {
  targetUrl: "https://jsonplaceholder.typicode.com/posts",
  data: {
    title: "Alon POS Product Update",
    body: "Product data from Alon POS system",
    userId: 1,
    timestamp: new Date().toISOString()
  }
};

console.log('Sending POST request to Alon POS API...');
console.log('Data:', JSON.stringify(data, null, 2));

// Using fetch to test the forward endpoint
fetch('http://localhost:9003/api/forward', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data),
})
.then(response => response.json())
.then(result => {
  console.log('\n✅ Success! Response from external API:');
  console.log(JSON.stringify(result, null, 2));
})
.catch(error => {
  console.error('❌ Error:', error.message);
});
