import type { Company } from "@shared/schema";

export interface ProfileCompletionResult {
  percentage: number;
  missingFields: string[];
  completedFields: string[];
  tier: 'incomplete' | 'basic' | 'good' | 'excellent';
}

export interface ProfileBenefits {
  matchQuality: string;
  expectedMatches: string;
  aiAccuracy: string;
  messageKey: string;
}

export function calculateProfileCompletion(profile: Company): ProfileCompletionResult {
  const fields: Record<string, { weight: number; labelKey: string }> = {
    companyName: { weight: 15, labelKey: 'dashboard.fieldLabels.companyName' },
    orgNumber: { weight: 5, labelKey: 'dashboard.fieldLabels.orgNumber' },
    industry: { weight: 15, labelKey: 'dashboard.fieldLabels.industry' },
    employees: { weight: 15, labelKey: 'dashboard.fieldLabels.employees' },
    revenue: { weight: 10, labelKey: 'company.form.revenue' },
    foundedYear: { weight: 5, labelKey: 'company.form.foundedYear' },
    location: { weight: 10, labelKey: 'dashboard.fieldLabels.location' },
    description: { weight: 20, labelKey: 'dashboard.fieldLabels.description' },
    contactEmail: { weight: 5, labelKey: 'company.notifications.emailLabel' },
  };

  let totalScore = 0;
  const missingFields: string[] = [];
  const completedFields: string[] = [];

  Object.entries(fields).forEach(([key, config]) => {
    const value = (profile as any)[key];
    const hasValue = Array.isArray(value) 
      ? value.length > 0 
      : value !== null && value !== undefined && value !== '' && value !== 0;

    if (hasValue) {
      totalScore += config.weight;
      completedFields.push(config.labelKey);
    } else {
      missingFields.push(config.labelKey);
    }
  });

  let tier: ProfileCompletionResult['tier'] = 'incomplete';
  if (totalScore >= 90) tier = 'excellent';
  else if (totalScore >= 70) tier = 'good';
  else if (totalScore >= 50) tier = 'basic';

  return {
    percentage: Math.min(totalScore, 100),
    missingFields,
    completedFields,
    tier,
  };
}

export function getProfileCompletionBenefits(percentage: number): ProfileBenefits {
  if (percentage >= 90) {
    return {
      matchQuality: 'excellent',
      expectedMatches: '15-20',
      aiAccuracy: '95%+',
      messageKey: 'profileCompletion.benefits.excellent',
    };
  } else if (percentage >= 70) {
    return {
      matchQuality: 'good',
      expectedMatches: '10-15',
      aiAccuracy: '85-90%',
      messageKey: 'profileCompletion.benefits.good',
    };
  } else if (percentage >= 50) {
    return {
      matchQuality: 'basic',
      expectedMatches: '5-10',
      aiAccuracy: '70-80%',
      messageKey: 'profileCompletion.benefits.basic',
    };
  } else {
    return {
      matchQuality: 'poor',
      expectedMatches: '0-5',
      aiAccuracy: '50-60%',
      messageKey: 'profileCompletion.benefits.poor',
    };
  }
}
