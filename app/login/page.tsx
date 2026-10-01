import { login } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; wait?: string }>;
}) {
  const { error, wait } = await searchParams;
  const minutes = Number(wait);
  const paused = Number.isFinite(minutes) && minutes > 0;
  return (
    <>
      <style>{`
        :root {
          --bg: #f5f5f3;
          --card: #ffffff;
          --text: #1a1a18;
          --border: rgba(0,0,0,0.14);
          --accent: #378ADD;
          --warn-bg: #FAEEDA;
          --warn-fg: #854F0B;
          --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --bg: #1c1c1a;
            --card: #252523;
            --text: #f0f0ec;
            --border: rgba(255,255,255,0.14);
            --warn-bg: #3a3020;
            --warn-fg: #e8c07a;
          }
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          color: var(--text);
          font: 15px/1.45 var(--font);
        }
        main {
          width: 100%;
          max-width: 360px;
          margin: 24px;
          padding: 28px 28px 24px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
        }
        h1 { margin: 0 0 22px; font-size: 20px; font-weight: 650; }
        label { display: block; margin: 0 0 6px; font-size: 13px; }
        input {
          width: 100%;
          margin: 0 0 14px;
          padding: 8px 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg);
          color: var(--text);
          font: inherit;
        }
        button {
          width: 100%;
          margin-top: 6px;
          padding: 9px 12px;
          border: 0;
          border-radius: 8px;
          background: var(--accent);
          color: #fff;
          font: inherit;
          font-weight: 600;
          cursor: pointer;
        }
        .err {
          margin: 0 0 16px;
          padding: 8px 10px;
          background: var(--warn-bg);
          color: var(--warn-fg);
          border-radius: 8px;
          font-size: 13px;
        }
      `}</style>
      <main>
        <h1>Target Account View</h1>
        {paused ? (
          <p className="err">
            Too many failed attempts. Please try again in {minutes} minute{minutes === 1 ? "" : "s"}.
          </p>
        ) : error ? (
          <p className="err">Wrong username or password.</p>
        ) : null}
        <form action={login}>
          <label htmlFor="username">Username</label>
          <input id="username" name="username" autoComplete="username" required autoFocus />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <button type="submit">Sign in</button>
        </form>
      </main>
    </>
  );
}
