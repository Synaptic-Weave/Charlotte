import { EntityManager } from '@mikro-orm/postgresql';
import { Tenant } from '../domain/entities/Tenant.js';

export interface AdminTenantListItemDTO {
  id: string;
  name: string;
  destinationNumber: string;
  destinationVerified: boolean;
  status: 'active' | 'pending';
  createdAt: Date;
  updatedAt: Date;
  totalCalls: number;
  totalNumbers: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class AdminTenantService {
  constructor(private readonly em: EntityManager) {}

  async listTenants(page: number, limit: number): Promise<PaginatedResult<AdminTenantListItemDTO>> {
    const offset = (page - 1) * limit;

    const [tenants, total] = await this.em.findAndCount(Tenant, {}, {
      limit,
      offset,
      orderBy: { createdAt: 'DESC' }
    });

    if (tenants.length === 0) {
      return {
        data: [],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    }

    const tenantIds = tenants.map(t => t.id);

    // Get call counts
    const callCountsRaw = await this.em.getConnection().execute(
      `SELECT tenant_id, COUNT(id)::int as count FROM call_sessions WHERE tenant_id = ANY(?) GROUP BY tenant_id`,
      [tenantIds]
    );
    const callCountMap = new Map<string, number>();
    callCountsRaw.forEach((r: any) => callCountMap.set(r.tenant_id, r.count));

    // Get phone number counts
    const numberCountsRaw = await this.em.getConnection().execute(
      `SELECT tenant_id, COUNT(id)::int as count FROM twilio_phone_numbers WHERE tenant_id = ANY(?) GROUP BY tenant_id`,
      [tenantIds]
    );
    const numberCountMap = new Map<string, number>();
    numberCountsRaw.forEach((r: any) => numberCountMap.set(r.tenant_id, r.count));

    const data: AdminTenantListItemDTO[] = tenants.map(t => {
      // Define a simple status logic based on whether destination is verified
      const status = t.destinationVerified ? 'active' : 'pending';

      return {
        id: t.id,
        name: t.name,
        destinationNumber: t.destinationNumber,
        destinationVerified: t.destinationVerified,
        status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        totalCalls: callCountMap.get(t.id) || 0,
        totalNumbers: numberCountMap.get(t.id) || 0
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}
