export const API_BASE = import.meta.env.PROD 
  ? 'https://dreamshell-backend.onrender.com'
  : 'http://localhost:3000';

export const getToken = () => localStorage.getItem('token');
export const setToken = (token: string) => localStorage.setItem('token', token);
export const clearToken = () => localStorage.removeItem('token');

export async function apiGet<T>(path: string): Promise<T> {
  const token = getToken();
  let retries = 0;
  const maxRetries = 3;
  
  while (retries < maxRetries) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      
      if (res.status === 503 || res.status === 504) {
        // Server is probably cold, wait and retry
        retries++;
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        continue;
      }
      
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    } catch (error) {
      if (retries === maxRetries - 1) throw error;
      retries++;
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  throw new Error('Maximum retries reached');
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
