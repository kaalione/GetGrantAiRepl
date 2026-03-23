import { differenceInDays, startOfDay } from 'date-fns';

export type DeadlineUrgency = 'critical' | 'urgent' | 'upcoming' | 'normal';

export interface CategorizedDeadlines {
  critical: any[];
  urgent: any[];
  upcoming: any[];
}

export function getDeadlineUrgency(deadline: Date | string): DeadlineUrgency {
  const now = startOfDay(new Date());
  const deadlineDate = startOfDay(new Date(deadline));
  const daysUntil = differenceInDays(deadlineDate, now);

  if (daysUntil < 0) return 'normal';
  if (daysUntil <= 3) return 'critical';
  if (daysUntil <= 7) return 'urgent';
  if (daysUntil <= 14) return 'upcoming';
  return 'normal';
}

export function categorizeGrantsByDeadline(grants: any[]): CategorizedDeadlines {
  const result: CategorizedDeadlines = {
    critical: [],
    urgent: [],
    upcoming: [],
  };

  grants.forEach(grant => {
    if (!grant.deadline) return;
    const urgency = getDeadlineUrgency(grant.deadline);
    if (urgency === 'critical') result.critical.push(grant);
    else if (urgency === 'urgent') result.urgent.push(grant);
    else if (urgency === 'upcoming') result.upcoming.push(grant);
  });

  return result;
}

export function getUrgencyColor(urgency: DeadlineUrgency) {
  switch (urgency) {
    case 'critical':
      return {
        bg: 'bg-red-50 dark:bg-red-900/20',
        border: 'border-red-500',
        text: 'text-red-900 dark:text-red-100',
        icon: 'text-red-600',
        badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
      };
    case 'urgent':
      return {
        bg: 'bg-amber-50 dark:bg-amber-900/20',
        border: 'border-amber-500',
        text: 'text-amber-900 dark:text-amber-100',
        icon: 'text-amber-600',
        badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
      };
    case 'upcoming':
      return {
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        border: 'border-blue-500',
        text: 'text-blue-900 dark:text-blue-100',
        icon: 'text-blue-600',
        badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
      };
    default:
      return {
        bg: 'bg-gray-50 dark:bg-gray-800',
        border: 'border-gray-300',
        text: 'text-gray-900 dark:text-gray-100',
        icon: 'text-gray-600',
        badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      };
  }
}
