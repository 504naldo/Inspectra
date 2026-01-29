/**
 * Smoke Alarm Expiry Calculation Utility
 * 
 * Sealed battery smoke alarms have a 10-year lifespan from install date.
 * This utility calculates expiry status and provides warnings.
 */

export type ExpiryStatus = 'expired' | 'expiring_soon' | 'ok' | 'unknown';

export interface SmokeAlarmExpiryInfo {
  status: ExpiryStatus;
  expiryDate: Date | null;
  daysRemaining: number | null;
  yearsRemaining: number | null;
  warningMessage: string | null;
}

/**
 * Calculate expiry information for a smoke alarm
 * @param installDate - The installation date of the smoke alarm
 * @param powerType - The power type (only sealed batteries have 10-year expiry)
 * @param warningThresholdDays - Days before expiry to show warning (default 365 = 1 year)
 */
export function calculateSmokeAlarmExpiry(
  installDate: Date | string | null | undefined,
  powerType: string | null | undefined,
  warningThresholdDays: number = 365
): SmokeAlarmExpiryInfo {
  // Only sealed battery smoke alarms have 10-year expiry
  if (!powerType || powerType.toLowerCase() !== 'sealed') {
    return {
      status: 'ok',
      expiryDate: null,
      daysRemaining: null,
      yearsRemaining: null,
      warningMessage: null,
    };
  }

  // If no install date, we can't calculate expiry
  if (!installDate) {
    return {
      status: 'unknown',
      expiryDate: null,
      daysRemaining: null,
      yearsRemaining: null,
      warningMessage: 'Install date required to calculate expiry',
    };
  }

  // Parse install date
  const install = typeof installDate === 'string' ? new Date(installDate) : installDate;
  
  // Check if date is valid
  if (isNaN(install.getTime())) {
    return {
      status: 'unknown',
      expiryDate: null,
      daysRemaining: null,
      yearsRemaining: null,
      warningMessage: 'Invalid install date',
    };
  }

  // Calculate expiry date (10 years from install)
  const expiry = new Date(install);
  expiry.setFullYear(expiry.getFullYear() + 10);

  // Calculate days remaining
  const now = new Date();
  const msRemaining = expiry.getTime() - now.getTime();
  const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
  const yearsRemaining = Math.floor(daysRemaining / 365);

  // Determine status
  let status: ExpiryStatus;
  let warningMessage: string | null = null;

  if (daysRemaining < 0) {
    status = 'expired';
    const daysExpired = Math.abs(daysRemaining);
    warningMessage = `Expired ${daysExpired} day${daysExpired !== 1 ? 's' : ''} ago`;
  } else if (daysRemaining <= warningThresholdDays) {
    status = 'expiring_soon';
    if (daysRemaining <= 30) {
      warningMessage = `Expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`;
    } else if (daysRemaining <= 365) {
      const monthsRemaining = Math.floor(daysRemaining / 30);
      warningMessage = `Expires in ${monthsRemaining} month${monthsRemaining !== 1 ? 's' : ''}`;
    } else {
      warningMessage = `Expires in ${yearsRemaining} year${yearsRemaining !== 1 ? 's' : ''}`;
    }
  } else {
    status = 'ok';
  }

  return {
    status,
    expiryDate: expiry,
    daysRemaining,
    yearsRemaining,
    warningMessage,
  };
}

/**
 * Get a human-readable expiry status label
 */
export function getExpiryStatusLabel(status: ExpiryStatus): string {
  switch (status) {
    case 'expired':
      return 'Expired';
    case 'expiring_soon':
      return 'Expiring Soon';
    case 'ok':
      return 'OK';
    case 'unknown':
      return 'Unknown';
  }
}

/**
 * Get a color class for expiry status badges
 */
export function getExpiryStatusColor(status: ExpiryStatus): string {
  switch (status) {
    case 'expired':
      return 'destructive';
    case 'expiring_soon':
      return 'warning';
    case 'ok':
      return 'success';
    case 'unknown':
      return 'secondary';
  }
}

/**
 * Format expiry date for display
 */
export function formatExpiryDate(date: Date | null): string {
  if (!date) return 'Unknown';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
