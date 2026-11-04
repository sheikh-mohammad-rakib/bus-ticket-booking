import { pathToFileURL } from "node:url";
import { pool } from "./db.js";

export async function seed() {
  const cityNames = [
    "Dhaka", "Chattogram", "Sylhet", "Khulna", "Rajshahi",
    "Barishal", "Cox's Bazar", "Rangpur", "Cumilla", "Mymensingh",
  ];
  const city = {};
  for (const name of cityNames) {
    const r = await pool.query("INSERT INTO cities (name) VALUES ($1) RETURNING id", [name]);
    city[name] = r.rows[0].id;
  }

  // Familiar BD operators with varied bus types (rows × cols = seat capacity)
  const busDefs = [
    ["Green Line", "Volvo 9600", "AC Sleeper", 8, 4],
    ["Hanif Enterprise", "Hino Scania", "AC Seater", 10, 4],
    ["Shohag Paribahan", "Multi-Axle Sleeper", "Sleeper", 8, 4],
    ["Ena Paribahan", "Ashok Leyland", "Non-AC", 10, 5],
    ["Shyamoli Paribahan", "Volvo B11R", "AC Sleeper", 9, 4],
    ["Royal Coach", "Mercedes Multi-Axle", "AC Seater", 10, 4],
  ];
  const busIds = [];
  for (const [operator, name, type, rows, cols] of busDefs) {
    const r = await pool.query(
      "INSERT INTO buses (operator, name, type, rows, cols) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [operator, name, type, rows, cols]
    );
    busIds.push(r.rows[0].id);
  }

  // City pairs with duration in minutes and typical fares in ৳
  const routes = [
    { cities: ["Dhaka", "Chattogram"], dur: 360, fare: 1100 },
    { cities: ["Dhaka", "Sylhet"], dur: 300, fare: 850 },
    { cities: ["Dhaka", "Cox's Bazar"], dur: 660, fare: 1800 },
    { cities: ["Dhaka", "Khulna"], dur: 330, fare: 950 },
    { cities: ["Dhaka", "Rajshahi"], dur: 300, fare: 850 },
    { cities: ["Dhaka", "Barishal"], dur: 360, fare: 900 },
    { cities: ["Dhaka", "Rangpur"], dur: 420, fare: 1150 },
    { cities: ["Dhaka", "Cumilla"], dur: 180, fare: 450 },
    { cities: ["Dhaka", "Mymensingh"], dur: 180, fare: 400 },
    { cities: ["Chattogram", "Cox's Bazar"], dur: 240, fare: 700 },
    { cities: ["Rajshahi", "Khulna"], dur: 240, fare: 600 },
    { cities: ["Sylhet", "Chattogram"], dur: 360, fare: 900 },
  ];

  // Departure slots through the day
  const times = ["06:30", "07:15", "08:00", "10:30", "14:00", "15:45", "18:30", "21:00", "22:30", "23:15"];

  let n = 0;
  for (const { cities: [a, b], dur, fare } of routes) {
    // Both directions
    for (let d = 0; d < 2; d++) {
      const from = d === 0 ? a : b;
      const to = d === 0 ? b : a;
      // Each direction gets 3–5 departures across the day with different buses
      const count = 3 + Math.floor(Math.random() * 2);
      const startIdx = Math.floor(Math.random() * (times.length - count));
      for (let i = 0; i < count; i++) {
        const busId = busIds[(n + i) % busIds.length];
        const jitter = 0.85 + Math.random() * 0.35; // ±15% fare jitter
        const durJitter = 1 + (Math.random() - 0.5) * 0.15;
        await pool.query(
          "INSERT INTO trips (bus_id, from_city_id, to_city_id, depart_time, duration_min, price) VALUES ($1, $2, $3, $4, $5, $6)",
          [
            busId,
            city[from],
            city[to],
            times[startIdx + i],
            Math.round((dur * durJitter) / 15) * 15,
            Math.round((fare * jitter) / 50) * 50, // fares land on realistic ৳50 steps
          ]
        );
        n++;
      }
    }
  }
  console.log(`Seeded ${cityNames.length} cities, ${busDefs.length} buses, ${n} trips.`);
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  seed()
    .then(() => pool.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
