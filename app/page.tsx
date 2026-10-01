import Board from "@/components/Board";
import { loadBoard } from "@/lib/load";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Page() {
  const user = (await currentUser()) ?? "";
  try {
    const data = await loadBoard();
    return <Board initial={data} user={user} />;
  } catch (err) {
    return (
      <main className="error-page">
        <h1>Couldn&apos;t load target accounts</h1>
        <p>{(err as Error).message}</p>
        <p style={{ marginTop: 12 }}>
          <a className="rl" href="/">Try again</a>
        </p>
      </main>
    );
  }
}
