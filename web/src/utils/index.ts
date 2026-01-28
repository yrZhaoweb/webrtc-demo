/**
 * Parse room ID from URL
 * @param url - Complete URL string or URL object
 * @returns Room ID if exists, null otherwise
 */
export function parseRoomIdFromUrl(url: string | URL): string | null {
  try {
    const urlObj = typeof url === "string" ? new URL(url) : url;
    const roomId = urlObj.searchParams.get("roomId");
    return roomId && roomId.trim() ? roomId.trim() : null;
  } catch (error) {
    console.error("Failed to parse room ID from URL:", error);
    return null;
  }
}

/**
 * Generate invite link for a room
 * @param roomId - Room ID (must be non-empty)
 * @param baseUrl - Base URL (optional, defaults to current origin)
 * @returns Complete invite link
 * @throws Error if roomId is empty
 */
export function generateInviteLink(roomId: string, baseUrl?: string): string {
  if (!roomId || !roomId.trim()) {
    throw new Error("Room ID cannot be empty");
  }

  const base = baseUrl || window.location.origin;
  const url = new URL(`/room/${roomId.trim()}`, base);
  return url.toString();
}

/**
 * Validate message content
 * @param content - Message content to validate
 * @returns true if message is valid (non-empty after trim)
 */
export function isValidMessage(content: string): boolean {
  return typeof content === "string" && content.trim().length > 0;
}

/**
 * Generate unique message ID
 * Uses timestamp and random string for uniqueness
 * @returns Unique message ID
 */
export function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Generate unique user ID
 * Uses timestamp and random string for uniqueness
 * @returns Unique user ID with 'user-' prefix
 */
export function generateUserId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Format timestamp to readable time string (HH:MM)
 * @param timestamp - Timestamp in milliseconds
 * @returns Formatted time string
 */
export function formatTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    return "00:00";
  }

  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
