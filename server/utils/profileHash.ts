import crypto from 'crypto';
import type { Company } from '@shared/schema';

export function hashProfile(company: Company): string {
  const key = JSON.stringify({
    industry: company.industry,
    employees: company.employees,
    revenue: company.revenue,
    location: company.location,
    focusAreas: company.focusAreas,
  });
  return crypto.createHash('sha256').update(key).digest('hex');
}
