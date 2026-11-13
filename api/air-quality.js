
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const apiKey = process.env.OPENAQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OpenAQ API key is not configured",
    });
  }

  const headers = {
    "X-API-Key": apiKey,
    Accept: "application/json",
  };

  const LOCATION_ID = 44513;
  const MAX_AGE_HOURS = 24;
  const FUTURE_TOLERANCE_MINUTES = 5;

  try {
    const [latestResponse, locationResponse] = await Promise.all([
      fetch(
        `https://api.openaq.org/v3/locations/${LOCATION_ID}/latest?limit=1000`,
        { headers }
      ),
      fetch(
        `https://api.openaq.org/v3/locations/${LOCATION_ID}`,
        { headers }
      ),
    ]);

    if (!latestResponse.ok || !locationResponse.ok) {
      console.error("OpenAQ response error:", {
        latestStatus: latestResponse.status,
        locationStatus: locationResponse.status,
      });

      return res.status(502).json({
        error: "Unable to retrieve OpenAQ data",
        latestStatus: latestResponse.status,
        locationStatus: locationResponse.status,
      });
    }

    const [latestData, locationData] = await Promise.all([
      latestResponse.json(),
      locationResponse.json(),
    ]);

    const location = locationData.results?.[0];

    if (!location) {
      return res.status(502).json({
        error: "Station details were not found",
      });
    }

    // Map sensor IDs to their actual parameters and units.
    const sensorMap = new Map(
      (location.sensors ?? []).map((sensor) => [
        sensor.id,
        {
          parameter:
            sensor.parameter?.name?.toLowerCase() ?? "unknown",
          unit: sensor.parameter?.units ?? null,
        },
      ])
    );

    const now = Date.now();
    const maxAgeMs = MAX_AGE_HOURS * 60 * 60 * 1000;
    const futureToleranceMs =
      FUTURE_TOLERANCE_MINUTES * 60 * 1000;

    const readings = [];
    const staleReadings = [];
    const invalidReadings = [];

    for (const item of latestData.results ?? []) {
      const sensor = sensorMap.get(item.sensorsId);

      const reading = {
        parameter: sensor?.parameter ?? "unknown",
        value: item.value,
        unit: sensor?.unit ?? null,
        time: item.datetime?.utc ?? null,
        sensorId: item.sensorsId,
      };

      // Reject missing or invalid values.
      if (
        typeof item.value !== "number" ||
        !Number.isFinite(item.value) ||
        item.value < 0
      ) {
        invalidReadings.push({
          ...reading,
          reason: "Invalid or negative sensor value",
        });
        continue;
      }

      // Reject missing or invalid timestamps.
      const timestamp = Date.parse(reading.time);

      if (!Number.isFinite(timestamp)) {
        invalidReadings.push({
          ...reading,
          reason: "Missing or invalid timestamp",
        });
        continue;
      }

      // Reject readings dated too far into the future.
      if (timestamp > now + futureToleranceMs) {
        invalidReadings.push({
          ...reading,
          reason: "Future timestamp",
        });
        continue;
      }

      // Separate old measurements from current readings.
      if (now - timestamp > maxAgeMs) {
        staleReadings.push({
          ...reading,
          reason: "Reading older than 24 hours",
        });
        continue;
      }

      readings.push(reading);
    }

    // Newest measurements first.
    readings.sort(
      (a, b) => Date.parse(b.time) - Date.parse(a.time)
    );

    return res.status(200).json({
      station: location.name ?? "Kadri, Mangalore - KSPCB",
      provider: location.provider?.name ?? "Unknown",
      source: "OpenAQ",
      fetchedAt: new Date(now).toISOString(),

      dataStatus:
        readings.length > 0 ? "available" : "unavailable",

      freshness: {
        maximumAgeHours: MAX_AGE_HOURS,
        currentReadings: readings.length,
        staleReadings: staleReadings.length,
        invalidReadings: invalidReadings.length,
      },

      readings,
      staleReadings,
      invalidReadings,
    });
  } catch (error) {
    console.error("Air quality API error:", error);

    return res.status(500).json({
      error: "Failed to contact OpenAQ",
    });
  }
}
