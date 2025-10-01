import express from "express";

const app = express();
app.use(express.json()); // modern way, no need body-parser

// health check route
app.get("/", (req, res) => {
  res.send("Astrology backend is running 🚀");
});

// predict route
app.post("/predict", (req, res) => {
  const { date, time, place } = req.body;
  console.log("Request received:", req.body);
  res.json({
    chart: { Sun: "Capricorn 23°", Moon: "Cancer 10°" },
    prediction: `Your details: ${date} ${time} ${place}.`
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
