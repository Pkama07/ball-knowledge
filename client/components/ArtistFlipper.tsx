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
  "Eminem",
  "Adele",
  "Justin Bieber",
  "Lady Gaga",
  "Bruno Mars",
  "Ed Sheeran",
  "Nicki Minaj",
  "Cardi B",
  "Megan Thee Stallion",
  "Olivia Rodrigo",
  "Dua Lipa",
  "Harry Styles",
  "The Beatles",
  "Michael Jackson",
  "Prince",
  "Madonna",
  "Stevie Wonder",
  "David Bowie",
  "Queen",
  "Led Zeppelin",
  "Pink Floyd",
  "The Rolling Stones",
  "Nirvana",
  "Radiohead",
  "Fleetwood Mac",
  "Bob Dylan",
  "Bruce Springsteen",
  "Elton John",
  "Whitney Houston",
  "Mariah Carey",
  "Aretha Franklin",
  "Marvin Gaye",
  "Tupac Shakur",
  "The Notorious B.I.G.",
  "Jay-Z",
  "Nas",
  "Snoop Dogg",
  "Dr. Dre",
  "50 Cent",
  "Lil Wayne",
  "Kid Cudi",
  "A$AP Rocky",
  "Tyler Childers",
  "Childish Gambino",
  "Chance the Rapper",
  "Mac Miller",
  "Juice WRLD",
  "XXXTentacion",
  "Lil Uzi Vert",
  "21 Savage",
  "Metro Boomin",
  "Young Thug",
  "Gunna",
  "Lil Baby",
  "DaBaby",
  "Roddy Ricch",
  "Migos",
  "Offset",
  "Quavo",
  "Tame Impala",
  "Arctic Monkeys",
  "The Strokes",
  "Coldplay",
  "Imagine Dragons",
  "Maroon 5",
  "OneRepublic",
  "Twenty One Pilots",
  "Panic! at the Disco",
  "Fall Out Boy",
  "Red Hot Chili Peppers",
  "Foo Fighters",
  "Green Day",
  "Linkin Park",
  "Metallica",
  "AC/DC",
  "Guns N' Roses",
  "Daft Punk",
  "Calvin Harris",
  "Avicii",
  "Marshmello",
  "Khalid",
];

const INTERVAL_MS = 2200;

export function ArtistFlipper() {
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const prev = useRef(0);

  // Randomize the starting artist on every refresh. Done in an effect (not in
  // useState initializer) so server and client render the same first frame and
  // avoid a hydration mismatch. Until the random start is picked, `ready` is
  // false and nothing is shown, so the user never sees Drake (index 0) flash.
  useEffect(() => {
    const start = Math.floor(Math.random() * ARTISTS.length);
    prev.current = start;
    setIndex(start);
    setReady(true);
  }, []);

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
        const isActive = ready && i === index;
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
