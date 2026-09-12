/**
 * Display name formatting utility for AuctionLoom.
 * Ensures user privacy by prioritizing human names over raw email addresses
 * and formatting fallback usernames elegantly.
 */

export function formatDisplayName(userOrName, fallbackEmail) {
  if (!userOrName && !fallbackEmail) return 'Anonymous';

  let name = '';
  let email = '';

  if (typeof userOrName === 'string') {
    if (userOrName.includes('@')) {
      email = userOrName;
    } else {
      name = userOrName;
    }
  } else if (typeof userOrName === 'object' && userOrName !== null) {
    name = userOrName.name || userOrName.bidder_name || userOrName.seller_name || userOrName.senderName || '';
    email = userOrName.email || userOrName.bidder_email || userOrName.seller_email || userOrName.senderEmail || '';
  }

  if (fallbackEmail && !email) {
    email = fallbackEmail;
  }

  // If we have a clean name that isn't just an email address, use it
  if (name && typeof name === 'string' && name.trim() && !name.includes('@')) {
    return name.trim();
  }

  // Fallback to extracting and beautifying the username from email
  const rawTarget = (name && name.includes('@')) ? name : email;
  if (rawTarget && typeof rawTarget === 'string' && rawTarget.includes('@')) {
    let username = rawTarget.split('@')[0];

    // Remove long epoch timestamps (e.g., _1789072459407)
    username = username.replace(/[_-]\d{9,}$/, '');

    // Replace dots, hyphens, and underscores with spaces
    username = username.replace(/[._-]+/g, ' ').trim();

    // Capitalize each word
    const words = username.split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return username.charAt(0).toUpperCase() + username.slice(1);
  }

  return name || 'Bidder';
}

/**
 * Returns 1-2 uppercase letters for user avatars.
 */
export function getInitials(name) {
  if (!name) return 'U';
  const clean = formatDisplayName(name);
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.substring(0, 2).toUpperCase();
}
