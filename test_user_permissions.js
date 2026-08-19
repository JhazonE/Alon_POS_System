const mysql = require('mysql2/promise');

async function testUserPermissions() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'rootpassword',
      database: 'alon_pos'
    });

    console.log('Connected to MySQL');

    // Test 1: Check if user_permissions table exists
    console.log('\n=== Test 1: Check user_permissions table ===');
    const [tables] = await connection.execute('SHOW TABLES LIKE "user_permissions"');
    if (tables.length > 0) {
      console.log('✅ user_permissions table exists');
    } else {
      console.log('❌ user_permissions table does not exist');
      return;
    }

    // Test 2: Insert some test permissions
    console.log('\n=== Test 2: Insert test permissions ===');
    const testUid = 'test-user-123';
    const testPermissions = [
      ['perm-1', testUid, 'access_pos'],
      ['perm-2', testUid, 'view_dashboard'],
      ['perm-3', testUid, 'manage_products']
    ];

    // Clear any existing test data
    await connection.execute('DELETE FROM user_permissions WHERE user_uid = ?', [testUid]);

    for (const [id, uid, permission] of testPermissions) {
      await connection.execute(
        'INSERT INTO user_permissions (id, user_uid, permission) VALUES (?, ?, ?)',
        [id, uid, permission]
      );
    }
    console.log('✅ Test permissions inserted');

    // Test 3: Query permissions for the test user
    console.log('\n=== Test 3: Query permissions ===');
    const [permissions] = await connection.execute(
      'SELECT permission FROM user_permissions WHERE user_uid = ? ORDER BY permission',
      [testUid]
    );

    const permissionList = permissions.map(row => row.permission);
    console.log('Permissions for test user:', permissionList);

    if (permissionList.length === 3 &&
        permissionList.includes('access_pos') &&
        permissionList.includes('view_dashboard') &&
        permissionList.includes('manage_products')) {
      console.log('✅ Permissions retrieved correctly');
    } else {
      console.log('❌ Permissions not retrieved correctly');
    }

    // Test 4: Update permissions (remove one, add another)
    console.log('\n=== Test 4: Update permissions ===');
    await connection.execute('DELETE FROM user_permissions WHERE user_uid = ? AND permission = ?', [testUid, 'manage_products']);
    await connection.execute(
      'INSERT INTO user_permissions (id, user_uid, permission) VALUES (?, ?, ?)',
      ['perm-4', testUid, 'super_admin']
    );
    console.log('✅ Permissions updated');

    // Test 5: Verify updated permissions
    console.log('\n=== Test 5: Verify updated permissions ===');
    const [updatedPermissions] = await connection.execute(
      'SELECT permission FROM user_permissions WHERE user_uid = ? ORDER BY permission',
      [testUid]
    );

    const updatedPermissionList = updatedPermissions.map(row => row.permission);
    console.log('Updated permissions for test user:', updatedPermissionList);

    if (updatedPermissionList.length === 3 &&
        updatedPermissionList.includes('access_pos') &&
        updatedPermissionList.includes('view_dashboard') &&
        updatedPermissionList.includes('super_admin')) {
      console.log('✅ Permissions updated correctly');
    } else {
      console.log('❌ Permissions not updated correctly');
    }

    // Clean up test data
    console.log('\n=== Clean up: Remove test data ===');
    await connection.execute('DELETE FROM user_permissions WHERE user_uid = ?', [testUid]);
    console.log('✅ Test data cleaned up');

    await connection.end();
    console.log('\n🎉 All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    if (connection) {
      await connection.end();
    }
  }
}

testUserPermissions();
