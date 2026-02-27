export async function apiRequest({ baseUrl, path, method = 'GET', sessionToken, body }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { 'x-session-token': sessionToken } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }

  if (!response.ok) {
    const detail = payload?.detail || payload?.message || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return payload;
}
