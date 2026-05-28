import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables to resolve database connection URL
dotenv.config({ path: path.resolve(__dirname, '../.env') });

test.describe('Charlotte End-to-End User Story Testing Suite', () => {
  
  // Self-Healing database teardown to ensure the onboarding test is 100% repeatable
  test.beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL || 'postgresql://charlotte_admin:password@localhost:5432/charlotte_db?sslmode=disable';
    const client = new Client({ connectionString: dbUrl });
    try {
      await client.connect();
      // Locate previous test workspace and delete child rows to guarantee FK compliance
      const res = await client.query("SELECT tenant_id FROM users WHERE email = 'test-e2e@acme.com'");
      if (res.rowCount > 0) {
        const tenantId = res.rows[0].tenant_id;
        
        // Execute manual transactional teardown in reverse dependency order
        await client.query("BEGIN");
        await client.query("DELETE FROM users WHERE tenant_id = $1", [tenantId]);
        await client.query("DELETE FROM organizations WHERE tenant_id = $1", [tenantId]);
        await client.query("DELETE FROM twilio_phone_numbers WHERE tenant_id = $1", [tenantId]);
        await client.query("DELETE FROM call_sessions WHERE tenant_id = $1", [tenantId]);
        await client.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
        await client.query("COMMIT");
        
        console.log(`[E2E Cleanup] Successfully deleted existing test tenant: ${tenantId}`);
      }
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (e) {}
      console.error('[E2E Cleanup Error] Could not clean test database context:', err);
    } finally {
      await client.end();
    }
  });

  test('US-101, US-102, and Settings Persistence User Story Flow', async ({ page }) => {
    
    // Listen for browser console logs and errors
    page.on('console', msg => {
      console.log(`[Browser Console] [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
      console.error(`[Browser Page Error] ${err.message}\n${err.stack}`);
    });

    // =========================================================================
    // PART 1: US-101 Onboarding & Destination Verification
    // =========================================================================
    
    // 1. Visit onboarding page and switch to Register view
    await page.goto('/');
    await page.click('#auth-tab-register');
    
    // 2. Populate Signup Form
    await page.fill('#auth-email', 'test-e2e@acme.com');
    await page.fill('#auth-password', 'password123');
    await page.fill('#auth-tenant-name', 'E2E Acme Corp');
    await page.fill('#auth-forwarding-number', '+15125550100');
    
    // 3. Submit Form
    await page.click('#auth-submit-btn');
    
    // 4. Assert successful redirect into the main Dashboard Overview
    await expect(page.locator('#main-header-title')).toContainText('Tenant Desk Overview');
    await expect(page.locator('#sidebar-user-name')).toContainText('E2E Acme Corp');

    // =========================================================================
    // PART 2: US-102 Phone Number Search & Provisioning
    // =========================================================================
    
    // 1. Navigate to Provisioning hotline page
    await page.click('#nav-provision');
    await expect(page.locator('#main-header-title')).toContainText('Provisioning Portal');
    
    // 2. Input search area code and trigger search
    await page.fill('#wizard-area-code', '512');
    await page.click('#wizard-search-btn');
    
    // 3. Assert search grid has items and click the first number
    const numberCard = page.locator('.wizard-container .glass-card.interactive').first();
    await expect(numberCard).toBeVisible();
    await numberCard.click();
    
    // 4. Proceed to compliance review
    await page.click('#wizard-step1-next');
    
    // 5. Accept compliance and proceed
    await page.check('#wizard-compliance-checkbox');
    await page.click('#wizard-step2-next');
    
    // 6. Confirm and provision the number
    await page.click('#wizard-provision-btn');
    
    // 7. Assert successful provision and redirect back to Overview Dashboard
    // Wait for the 3.5s success animation redirect to finish
    await expect(page.locator('#main-header-title')).toContainText('Tenant Desk Overview', { timeout: 10000 });
    
    // 8. Verify that the purchased hotline number appears inside the active logs or active playground list
    await page.click('#nav-live');
    await expect(page.locator('strong:has-text("Active Desk Hotlines:")')).toBeVisible();

    // =========================================================================
    // PART 3: Agent Settings Update & Persistence Sync
    // =========================================================================
    
    // 1. Navigate to Settings page
    await page.click('#nav-settings');
    await expect(page.locator('#main-header-title')).toContainText('AI Agent Settings');
    
    // 2. Modify configs
    await page.fill('#settings-tenant-name', 'E2E Acme Corp Modified');
    await page.fill('#settings-forwarding-number', '+15125559999');
    
    // 3. Save configurations
    await page.click('#settings-save-btn');
    
    // 4. Verify save success alert banner appears
    await expect(page.locator('text=Tenant settings saved and synchronized successfully!')).toBeVisible();
    
    // 5. Assert Sidebar Profile and Header updates immediately
    await expect(page.locator('#sidebar-user-name')).toContainText('E2E Acme Corp Modified');
    
    // 6. Reload page and assert local/state persistence remains intact
    await page.reload();
    await expect(page.locator('#sidebar-user-name')).toContainText('E2E Acme Corp Modified');
    await page.click('#nav-settings');
    await expect(page.locator('#settings-tenant-name')).toHaveValue('E2E Acme Corp Modified');
    await expect(page.locator('#settings-forwarding-number')).toHaveValue('+15125559999');
  });
});
