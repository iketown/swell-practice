"use client";

import "../stage-plot/stage-plot.css";

export default function RiderCheckError({ reset }: { reset: () => void }) {
  return (
    <main className="rider">
      <section className="rider-check">
        <h1>We couldn’t check this edition right now.</h1>
        <p>
          Try again before working from this rider, or confirm your copy with
          The Swell.
        </p>
        <button className="primary" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
