export default function Loading() {
  return (
    <main style={{ marginTop: 32 }} aria-busy="true" aria-label="Searching">
      <div className="skeleton" />
      <div className="skeleton" style={{ opacity: 0.7 }} />
      <div className="skeleton" style={{ opacity: 0.45 }} />
    </main>
  );
}
