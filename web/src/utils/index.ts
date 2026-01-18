/**
 * 从 URL 中解析房间 ID
 * @param url - 完整的 URL 字符串或 URL 对象
 * @returns 房间 ID，如果不存在则返回 null
 */
export function parseRoomIdFromUrl(url: string | URL): string | null {
  try {
    const urlObj = typeof url === "string" ? new URL(url) : url;
    const roomId = urlObj.searchParams.get("roomId");
    return roomId;
  } catch (error) {
    return null;
  }
}

/**
 * 生成邀请链接
 * @param roomId - 房间 ID
 * @param baseUrl - 基础 URL（可选，默认使用当前页面的 origin）
 * @returns 完整的邀请链接
 */
export function generateInviteLink(roomId: string, baseUrl?: string): string {
  const base = baseUrl || window.location.origin;
  // 使用路径参数格式，更简洁
  const url = new URL(`/room/${roomId}`, base);
  return url.toString();
}

/**
 * 验证消息内容是否为空或仅包含空白字符
 * @param content - 消息内容
 * @returns 如果消息有效返回 true，否则返回 false
 */
export function isValidMessage(content: string): boolean {
  return content.trim().length > 0;
}

/**
 * 生成唯一的消息 ID
 * @returns 唯一的消息 ID
 */
export function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 生成唯一的用户 ID
 * @returns 唯一的用户 ID
 */
export function generateUserId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 格式化时间戳为可读的时间字符串
 * @param timestamp - 时间戳（毫秒）
 * @returns 格式化的时间字符串
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
