const mysql = require('mysql2/promise');

async function seedUsers() {
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

    // Seed initial users
    const users = [
      {
        uid: 'mock-admin-01',
        username: 'admin',
        display_name: 'Super Admin',
        photo_url: '',
        disabled: false,
        creation_time: new Date('2023-01-15T10:00:00Z').toISOString(),
      },
      {
        uid: 'mock-cashier-01',
        username: 'cashier',
        display_name: 'John Cashier',
        photo_url: '',
        disabled: false,
        creation_time: new Date('2023-02-20T11:30:00Z').toISOString(),
      },
      {
        uid: 'mock-inventory-01',
        username: 'inventory',
        display_name: 'Jane Stocker',
        photo_url: '',
        disabled: true,
        creation_time: new Date('2023-03-10T09:00:00Z').toISOString(),
      },
    ];

    // Insert users
    for (const user of users) {
      await connection.execute(
        'INSERT INTO users (uid, username, display_name, photo_url, disabled, creation_time) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE username=username',
        [user.uid, user.username, user.display_name, user.photo_url, user.disabled, user.creation_time]
      );
    }
    console.log('✅ Users seeded');

    // Seed permissions
    const permissions = [
      { user_uid: 'mock-admin-01', permission: 'super_admin' },
      { user_uid: 'mock-cashier-01', permission: 'access_pos' },
      { user_uid: 'mock-cashier-01', permission: 'view_dashboard' },
      { user_uid: 'mock-inventory-01', permission: 'manage_inventory' },
      { user_uid: 'mock-inventory-01', permission: 'manage_products' },
    ];

    // Insert permissions
    for (const perm of permissions) {
      const id = require('crypto').randomUUID();
      await connection.execute(
        'INSERT INTO user_permissions (id, user_uid, permission) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE permission=permission',
        [id, perm.user_uid, perm.permission]
      );
    }
    console.log('✅ Permissions seeded');

    await connection.end();
    console.log('\n🎉 Users seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    if (connection) {
      await connection.end();
    }
  }
}

seedUsers();
