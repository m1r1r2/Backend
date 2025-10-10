import express from "express";
import sweph from "swisseph-v2";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

// --- Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const swe = sweph?.default?.swe || sweph?.default || sweph;

// Set ephemeris path
swe.swe_set_ephe_path(path.join(__dirname, "ephe"));
console.log("Ephemeris path:", path.join(__dirname, "ephe"));

const app = express();
app.use(cors());
app.use(express.json());

// Zodiac signs and nakshatras
const zodiacSigns = [
  "Aries","Taurus","Gemini","Cancer","Leo","Virgo",
  "Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"
];

const nakshatras = [
  "Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra",
  "Punarvasu","Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni",
  "Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha",
  "Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta","Shatabhisha",
  "Purva Bhadrapada","Uttara Bhadrapada","Revati"
];

// --- Helper: suppress Swisseph stdout ---
function suppressSwissephOutput(fn) {
  const originalWrite = process.stdout.write;
  process.stdout.write = () => true; // block stdout
  try {
    return fn();
  } finally {
    process.stdout.write = originalWrite;
  }
}

// --- Julian day conversion ---
function julianDayUTC(y, m, d, h = 12, mn = 0, tz = 5.5) {
  const utcHour = h + mn / 60 - tz;
  return swe.swe_julday(y, m, d, utcHour, swe.SE_GREG_CAL);
}

// --- Nakshatra calculation ---
function getNakshatra(siderealLon) {
  const index = Math.floor(siderealLon / 13.3333);
  const degreeInNakshatra = siderealLon % 13.3333;
  return {
    nakshatra: nakshatras[index],
    degree: degreeInNakshatra.toFixed(2)
  };
}

// --- Planet calculation ---
function getVedicSignWithDegree(y, m, d, h, mn, planetConst, tz) {
  const jd = julianDayUTC(y, m, d, h, mn, tz);
  const flags = swe.SEFLG_SWIEPH | swe.SEFLG_TRUEPOS;
  const res = swe.swe_calc_ut(jd, planetConst, flags);

  let lon;
  if (Array.isArray(res)) lon = res[0];
  else if (res?.xx && Array.isArray(res.xx)) lon = res.xx[0];
  else if (typeof res?.longitude === "number") lon = res.longitude;
  else if (res?.data && Array.isArray(res.data)) lon = res.data[0];
  else throw new Error("Unknown swe_calc_ut format");

  const ayan = swe.swe_get_ayanamsa(jd);
  const siderealLon = (lon - ayan + 360) % 360;

  return { siderealLon };
}

// --- Rahu/Ketu ---
function getRahuKetu(y, m, d, h, mn, tz) {
  const jd = julianDayUTC(y, m, d, h, mn, tz);
  const flags = swe.SEFLG_SWIEPH | swe.SEFLG_TRUEPOS;
  const res = swe.swe_calc_ut(jd, swe.SE_MEAN_NODE, flags);

  let nodeLon;
  if (Array.isArray(res)) nodeLon = res[0];
  else if (res?.xx && Array.isArray(res.xx)) nodeLon = res.xx[0];
  else if (typeof res?.longitude === "number") nodeLon = res.longitude;
  else if (res?.data && Array.isArray(res.data)) nodeLon = res.data[0];
  else throw new Error("Unknown swe_calc_ut format for Rahu");

  const ayan = swe.swe_get_ayanamsa(jd);
  const rahuLon = (nodeLon - ayan + 360) % 360;
  const ketuLon = (rahuLon + 180) % 360;

  return {
    rahu: {
      sign: zodiacSigns[Math.floor(rahuLon / 30)],
      degree: (rahuLon % 30).toFixed(2),
      nakshatra: getNakshatra(rahuLon).nakshatra
    },
    ketu: {
      sign: zodiacSigns[Math.floor(ketuLon / 30)],
      degree: (ketuLon % 30).toFixed(2),
      nakshatra: getNakshatra(ketuLon).nakshatra
    }
  };
}

// --- Ascendant ---
function getAscendant(y, m, d, h, mn, lat, lon, tz) {
  const jd = julianDayUTC(y, m, d, h, mn, tz);
  const flags = swe.SEFLG_SWIEPH | swe.SEFLG_TRUEPOS;
  const resHouses = swe.swe_houses_ex(jd, flags, lat, lon, 'P');

  let ascLon;
  if (resHouses?.ascmc && Array.isArray(resHouses.ascmc)) ascLon = resHouses.ascmc[0];
  else if (typeof resHouses?.ascendant === "number") ascLon = resHouses.ascendant;
  else throw new Error("Failed to calculate Ascendant");

  const ayan = swe.swe_get_ayanamsa(jd);
  const siderealAsc = (ascLon - ayan + 360) % 360;

  const nak = getNakshatra(siderealAsc);
  return {
    sign: zodiacSigns[Math.floor(siderealAsc / 30)],
    degree: (siderealAsc % 30).toFixed(2),
    nakshatra: nak.nakshatra
  };
}

// --- Convert sidereal longitude to sign + degree + nakshatra ---
function getVedicSignFromLon(siderealLon) {
  const signIndex = Math.floor(siderealLon / 30);
  const degreeInSign = siderealLon % 30;
  const nak = getNakshatra(siderealLon);
  return {
    sign: zodiacSigns[signIndex],
    degree: degreeInSign.toFixed(2),
    nakshatra: nak.nakshatra
  };
}

// --- API ---
app.post("/vedic-signs", (req, res) => {
  try {
    const { date, time, timezone = 5.5, latitude, longitude } = req.body;
    if (!date) return res.status(400).json({ error: "Missing 'date'" });
    if (latitude === undefined || longitude === undefined) 
      return res.status(400).json({ error: "Missing 'latitude' or 'longitude'" });

    const [y, m, d] = date.split("-").map(Number);
    let h = 12, mn = 0;
    if (time) [h, mn] = time.split(":").map(Number);

    // Planets
    const planetKeys = ['sun','moon','mercury','venus','mars','jupiter','saturn'];
    const planets = {};
    for (const key of planetKeys) {
      const obj = suppressSwissephOutput(() =>
        getVedicSignWithDegree(y, m, d, h, mn, swe[`SE_${key.toUpperCase()}`], timezone)
      );
      planets[key] = getVedicSignFromLon(obj.siderealLon);
    }

    // Nodes
    const nodes = suppressSwissephOutput(() => getRahuKetu(y, m, d, h, mn, timezone));

    // Ascendant
    const ascendant = suppressSwissephOutput(() =>
      getAscendant(y, m, d, h, mn, latitude, longitude, timezone)
    );

    res.json({ date, time, timezone, latitude, longitude, ...planets, ...nodes, ascendant });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Vedic astrology server running on port ${PORT}`);
});

