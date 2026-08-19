
import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Helper to read .env file
function readEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  try {
      if (!fs.existsSync(envPath)) {
        return {};
      }
      const envConfig = dotenv.parse(fs.readFileSync(envPath));
      return envConfig;
  } catch (e) {
      console.error("Error reading .env file", e);
      return {};
  }
}

// Helper to write to .env file
function writeEnvFile(newConfig: Record<string, string>) {
  const envPath = path.resolve(process.cwd(), '.env');
  let currentConfig = {};
  try {
      currentConfig = readEnvFile();
  } catch (e) {
      // ignore
  }
  
  const mergedConfig = { ...currentConfig, ...newConfig };
  
  const envContent = Object.entries(mergedConfig)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
    
  fs.writeFileSync(envPath, envContent);
}

export async function GET() {
  const config = readEnvFile();
  
  // Return config but mask password
  return NextResponse.json({
    host: config.DB_HOST || 'localhost',
    port: config.DB_PORT || '3306',
    user: config.DB_USER || 'root',
    database: config.DB_NAME || 'alon_pos',
    // Don't send the actual password for security, or send a placeholder if it exists
    hasPassword: !!config.DB_PASSWORD
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { host, port, user, password, database, action } = body;

    // Blank password means "keep the one already configured" (matches the UI hint).
    const effectivePassword = password || readEnvFile().DB_PASSWORD || '';

    if (action === 'test') {
      // Test connection
      try {
        const connection = await mysql.createConnection({
          host,
          port: parseInt(port),
          user,
          password: effectivePassword,
          database
        });
        await connection.end();
        return NextResponse.json({ success: true, message: 'Connection successful!' });
      } catch (error: any) {
        return NextResponse.json({ success: false, message: `Connection failed: ${error.message}` }, { status: 400 });
      }
    } else if (action === 'save') {
      // Save to .env
      writeEnvFile({
        DB_HOST: host,
        DB_PORT: port.toString(),
        DB_USER: user,
        DB_PASSWORD: effectivePassword,
        DB_NAME: database
      });
      
      return NextResponse.json({ success: true, message: 'Configuration saved. Please restart the application for changes to take effect.' });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    console.error('Error in database settings:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
