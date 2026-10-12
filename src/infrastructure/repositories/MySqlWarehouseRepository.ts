import { query } from '../../../lib/mysql';
import { mainBranchId } from '../../../lib/branch-context';
import { WarehouseRepository } from '../../core/warehouses/domain/IWarehouseRepository';
import { WarehouseEntity } from '../../core/warehouses/domain/Warehouse';

export class MySqlWarehouseRepository implements WarehouseRepository {
  async findAll(): Promise<WarehouseEntity[]> {
    const sql = 'SELECT id, name, location, contact_number as contactNumber, active, is_main as isMain, created_at as createdAt, updated_at as updatedAt FROM warehouses ORDER BY name ASC';
    const warehouses: any[] = await query(sql);
    return warehouses.map(w => ({
      ...w,
      active: !!w.active,
      isMain: !!w.isMain
    }));
  }

  async findById(id: string): Promise<WarehouseEntity | null> {
    const sql = 'SELECT id, name, location, contact_number as contactNumber, active, is_main as isMain, created_at as createdAt, updated_at as updatedAt FROM warehouses WHERE id = ?';
    const results: any[] = await query(sql, [id]);
    if (results.length === 0) return null;
    const w = results[0];
    return {
      ...w,
      active: !!w.active,
      isMain: !!w.isMain
    };
  }

  async create(warehouse: Partial<WarehouseEntity>): Promise<string> {
    const sql = `
      INSERT INTO warehouses (id, name, location, contact_number, active, is_main, branch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    // No branch picker yet (Phase 5): new warehouses default to the main branch.
    const branchId = await mainBranchId();
    await query(sql, [
      warehouse.id, warehouse.name, warehouse.location || null, warehouse.contactNumber || null,
      warehouse.active ?? true, warehouse.isMain ?? false, branchId
    ]);
    return warehouse.id as string;
  }

  async update(id: string, warehouse: Partial<WarehouseEntity>): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];
    
    const fieldMapping: Record<string, string> = {
      name: 'name',
      location: 'location',
      contactNumber: 'contact_number',
      active: 'active',
      isMain: 'is_main'
    };

    Object.entries(warehouse).forEach(([key, value]) => {
      if (fieldMapping[key]) {
        updates.push(`${fieldMapping[key]} = ?`);
        params.push(value);
      }
    });

    if (updates.length > 0) {
      const sql = `UPDATE warehouses SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`;
      params.push(id);
      await query(sql, params);
    }
  }

  async delete(id: string): Promise<void> {
    await query('DELETE FROM warehouses WHERE id = ?', [id]);
  }
}
