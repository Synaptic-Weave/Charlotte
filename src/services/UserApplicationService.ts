export class UserApplicationService {
  constructor(private readonly em: any) {}
  async createUser(data: any): Promise<any> { return {}; }
  async authenticateUser(data: any): Promise<any> { return {}; }
  async verifyDestination(tenantId: string, pin: string): Promise<any> { return {}; }
  async getSettings(tenantId: string, userId: string): Promise<any> { return {}; }
  async updateSettings(tenantId: string, data: any): Promise<any> { return {}; }
}
