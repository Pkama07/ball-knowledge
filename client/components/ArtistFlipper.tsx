"use client";

// Rotates through a list of well-known artists in the home-page subtitle.
// All names are stacked in a single inline-grid cell so the box always sizes
// to the widest name (no reflow), and each name is centered within it. Only
// the active name is visible; it slides up and out while the next slides in.

import { useEffect, useRef, useState } from "react";

const ARTISTS = [
  "Drake",
  "Taylor Swift",
  "Kendrick Lamar",
  "Beyoncé",
  "The Weeknd",
  "Kanye West",
  "Rihanna",
  "Travis Scott",
  "Billie Eilish",
  "Bad Bunny",
  "Frank Ocean",
  "SZA",
  "Tyler, the Creator",
  "Ariana Grande",
  "Post Malone",
  "Future",
  "Doja Cat",
  "J. Cole",
  "Lana Del Rey",
  "Playboi Carti",
];

const INTERVAL_MS = 2200;

export function ArtistFlipper() {
  const [index, setIndex] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => {
        prev.current = i;
        return (i + 1) % ARTISTS.length;
      });
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="relative inline-grid overflow-hidden border-b border-neutral-500 text-center align-baseline">
      {ARTISTS.map((name, i) => {
        const isActive = i === index;
        const isLeaving = i === prev.current && !isActive;
        return (
          <span
            key={name}
            aria-hidden={!isActive}
            className="col-start-1 row-start-1 whitespace-nowrap font-semibold text-neutral-100 transition-all duration-500 ease-in-out"
            style={{
              opacity: isActive ? 1 : 0,
              transform: `translateY(${
                isActive ? "0" : isLeaving ? "-0.45em" : "0.45em"
              })`,
            }}
          >
            {name}
          </span>
        );
      })}
    </span>
  );
}
