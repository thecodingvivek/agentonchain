// Public demo values for the local prototype; this is not real authentication.
export const DEMO_CREDENTIALS = { username: "demo", password: "demo123" } as const;

export function authenticateDemo(username: string, password: string): boolean {
  return username.trim() === DEMO_CREDENTIALS.username && password === DEMO_CREDENTIALS.password;
}
