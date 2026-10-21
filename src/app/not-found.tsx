import Link from "next/link";

export default function NotFound() {
  return (
    <main className="setup">
      <h1>No such judgment</h1>
      <p>That case is not in the corpus. It may have been mistyped, or it was never one of the thirty.</p>
      <Link className="go" href="/" style={{ textDecoration: "none" }}>
        Back to search →
      </Link>
    </main>
  );
}
