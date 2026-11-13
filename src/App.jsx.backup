
import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cloud,
  Droplets,
  Gauge,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Wind,
  Thermometer,
  Database,
  Radio,
  AlertCircle
} from 'lucide-react';

const API_URL = '/api/air-quality';
const REFRESH_INTERVAL = 5 * 60 * 1000;

// Actual Kadri monitoring station location, approximate map position.
const STATION = {
  name: 'Kadri, Mangalore - KSPCB',
  city: 'Mangaluru',
  state: 'Karnataka',
  lat: 12.889,
  lng: 74.842
};

const POLLUTANTS = [
  { id: 'pm25', name: 'PM2.5', description: 'Fine particulate matter', icon: Cloud },
  { id: 'pm10', name: 'PM10', description: 'Coarse particulate matter', icon: Cloud },
  { id: 'o3', name: 'Ozone', description: 'Ground-level ozone', icon: Activity },
  { id: 'no2', name: 'Nitrogen dioxide', description: 'NO₂', icon: Activity },
  { id: 'so2', name: 'Sulphur dioxide', description: 'SO₂', icon: Activity },
  { id: 'co', name: 'Carbon monoxide', description: 'CO', icon: Activity },
  { id: 'no', name: 'Nitric oxide', description: 'NO', icon: Activity },
  { id: 'nox', name: 'Nitrogen oxides', description: 'NOx', icon: Activity }
];

const WEATHER = [
  { id: 'temperature', name: 'Temperature', icon: Thermometer },
  { id: 'relativehumidity', name: 'Humidity', icon: Droplets },
  { id: 'wind_speed', name: 'Wind speed', icon: Wind },
  { id: 'wind_direction', name: 'Wind direction', icon: Wind }
];

function formatTime(value) {
  if (!value) return 'Unavailable';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Unavailable';

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatValue(reading) {
  if (!reading || reading.value === undefined || reading.value === null) {
    return 'Unavailable';
  }

  return `${reading.value} ${reading.unit || ''}`.trim();
}

function getReading(readings, parameter) {
  return readings.find(
    reading => reading.parameter?.toLowerCase() === parameter
  );
}

function getDataAge(timestamp) {
  if (!timestamp) return null;

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return null;

  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

function getFreshnessLabel(minutes) {
  if (minutes === null) return 'Unknown';

  if (minutes < 120) return 'Recent';

  if (minutes < 360) return 'Delayed';

  return 'Old reading';
}

function getFreshnessClass(minutes) {
  if (minutes === null) return 'status-warning';

  if (minutes < 120) return 'status-good';

  if (minutes < 360) return 'status-warning';

  return 'status-danger';
}

function MapView() {
  const mapElement = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    if (!mapElement.current || mapInstance.current) return;

    const map = L.map(mapElement.current, {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView([STATION.lat, STATION.lng], 14);

    mapInstance.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const marker = L.marker([STATION.lat, STATION.lng]).addTo(map);

    marker.bindPopup(`
      <strong>${STATION.name}</strong><br/>
      CPCB monitoring station<br/>
      Data source: OpenAQ
    `);

    marker.openPopup();

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });

    resizeObserver.observe(mapElement.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  return (
    <div
      ref={mapElement}
      className="map-canvas"
      style={{
        width: '100%',
        height: '350px',
        minHeight: '300px',
        borderRadius: '8px',
        overflow: 'hidden'
      }}
      aria-label="Map showing Kadri monitoring station"
    />
  );
}

function MetricCard({ reading, name, description, icon: Icon }) {
  return (
    <article className="location-card">
      <div className="location-symbol">
        <Icon size={19} />
      </div>

      <div className="location-main">
        <h3>{name}</h3>
        <p>{description}</p>
      </div>

      <div className="location-measure">
        <b>{reading ? reading.value : '—'}</b>
        <span>{reading?.unit || 'No data'}</span>
      </div>
    </article>
  );
}

function App() {
  const [stationData, setStationData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [lastFetch, setLastFetch] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');

  const requestRef = useRef(false);

  const fetchData = async () => {
    if (requestRef.current) return;

    requestRef.current = true;
    setRefreshing(true);

    try {
      const response = await fetch(API_URL, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data.readings)) {
        throw new Error('Invalid API response: readings are missing');
      }

      setStationData(data);
      setLastFetch(new Date());
      setError('');

      setStatus(
        data.readings.length > 0 ? 'available' : 'unavailable'
      );
    } catch (err) {
      setError(err.message || 'Unable to retrieve station data');

      setStatus('error');
    } finally {
      requestRef.current = false;
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    const timer = setInterval(fetchData, REFRESH_INTERVAL);

    return () => clearInterval(timer);
  }, []);

  const readings = stationData?.readings || [];

  const latestReading = useMemo(() => {
    if (!readings.length) return null;

    return readings.reduce((latest, current) => {
      return new Date(current.time) > new Date(latest.time)
        ? current
        : latest;
    });
  }, [readings]);

  const sensorAge = getDataAge(latestReading?.time);

  const pm25 = getReading(readings, 'pm25');
  const pm10 = getReading(readings, 'pm10');

  const weatherData = WEATHER.map(item => ({
    ...item,
    reading: getReading(readings, item.id)
  }));

  const pollutionData = POLLUTANTS.map(item => ({
    ...item,
    reading: getReading(readings, item.id)
  }));

  const currentCount = stationData?.freshness?.currentReadings ?? readings.length;
  const staleCount = stationData?.freshness?.staleReadings ?? 0;
  const invalidCount = stationData?.freshness?.invalidReadings ?? 0;

  const navItems = [
    { name: 'Overview', icon: Gauge },
    { name: 'Pollutants', icon: Activity },
    { name: 'Station', icon: MapPin }
  ];

  const renderContent = () => {
    if (activeTab === 'Pollutants') {
      return (
        <div className="page-content">
          <section className="page-title">
            <div className="eyebrow">SENSOR MEASUREMENTS</div>
            <h1>Pollutants</h1>
            <p>Individual measurements reported by the Kadri monitoring station.</p>
          </section>

          <div className="location-list">
            {pollutionData.map(item => (
              <MetricCard
                key={item.id}
                reading={item.reading}
                name={item.name}
                description={item.description}
                icon={item.icon}
              />
            ))}
          </div>

          <div className="alert-disclaimer">
            Measurements are displayed in the units supplied by OpenAQ.
            They are not necessarily suitable for direct comparison across
            pollutants. Missing readings are not treated as zero.
          </div>
        </div>
      );
    }

    if (activeTab === 'Station') {
      return (
        <div className="page-content">
          <section className="page-title">
            <div className="eyebrow">MONITORING NETWORK</div>
            <h1>Station details</h1>
            <p>Information about the real-world monitoring station.</p>
          </section>

          <div className="selected-panel">
            <div className="eyebrow">REGISTERED MONITORING LOCATION</div>
            <h2>{stationData?.station || STATION.name}</h2>
            <p>{STATION.city}, {STATION.state}, India</p>

            <div className="reading-pair">
              <div>
                <span>PROVIDER</span>
                <b>{stationData?.provider || 'CPCB'}</b>
              </div>
              <div>
                <span>DATA SOURCE</span>
                <b>{stationData?.source || 'OpenAQ'}</b>
              </div>
            </div>

            <div className="reading-pair">
              <div>
                <span>CURRENT READINGS</span>
                <b>{currentCount}</b>
              </div>
              <div>
                <span>STALE READINGS</span>
                <b>{staleCount}</b>
              </div>
            </div>

            <div className="reading-pair">
              <div>
                <span>INVALID READINGS</span>
                <b>{invalidCount}</b>
              </div>
              <div>
                <span>MAXIMUM AGE</span>
                <b>{stationData?.freshness?.maximumAgeHours ?? 24} hours</b>
              </div>
            </div>
          </div>

          <section className="section-block">
            <div className="section-heading">
              <div>
                <div className="eyebrow">GEOGRAPHIC LOCATION</div>
                <h2>Kadri monitoring station</h2>
              </div>
            </div>

            <MapView />
          </section>
        </div>
      );
    }

    return (
      <div className="page-content">
        <section className="intro-row">
          <div>
            <div className="eyebrow">
              AIR QUALITY · LIVE MONITORING
            </div>

            <h1>
              Understand the air.<br />
              <span>Monitor your environment.</span>
            </h1>

            <p>
              AirMesh monitors reported pollution measurements from
              the Kadri CPCB station in Mangaluru.
            </p>
          </div>

          <div className="intro-stamp">
            <span>LIVE STATION</span>
            <b>01</b>
            <small>KADRI</small>
          </div>
        </section>

        <div className="summary-strip">
          <div>
            <span className="summary-label">MONITORING STATIONS</span>
            <b>01</b>
          </div>

          <div>
            <span className="summary-label">CURRENT READINGS</span>
            <b>{currentCount}</b>
          </div>

          <div>
            <span className="summary-label">STALE READINGS</span>
            <b>{staleCount}</b>
          </div>

          <div>
            <span className="summary-label">DATA SOURCE</span>
            <b>OpenAQ</b>
          </div>
        </div>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <div className="eyebrow">01 / MONITORING STATUS</div>
              <h2>Station overview</h2>
              <p>{stationData?.station || STATION.name}</p>
            </div>

            <button
              className="outline-button"
              onClick={fetchData}
              disabled={refreshing}
            >
              <RefreshCw
                size={15}
                className={refreshing ? 'spin' : ''}
              />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>

          {status === 'loading' && (
            <div className="empty-state">
              <RefreshCw size={20} />
              Retrieving monitoring station data...
            </div>
          )}

          {status === 'error' && (
            <div className="alert-disclaimer">
              <AlertCircle size={18} />
              <b>Unable to retrieve data</b>
              <p>{error}</p>
              <button className="outline-button" onClick={fetchData}>
                Try again
              </button>
            </div>
          )}

          {status === 'unavailable' && (
            <div className="empty-state">
              <AlertTriangle size={20} />
              No sufficiently recent sensor readings are available.
            </div>
          )}

          {status === 'available' && (
            <>
              <div className="selected-panel">
                <div className="selected-title">
                  <div>
                    <h2>{STATION.name}</h2>
                    <p>{STATION.city}, {STATION.state}</p>
                  </div>

                  <span className={`severity-tag ${
                    getFreshnessClass(sensorAge)
                  }`}>
                    {getFreshnessLabel(sensorAge)}
                  </span>
                </div>

                <div className="source-type">
                  <Radio size={15} />
                  {stationData?.provider || 'CPCB'}
                  <span>·</span>
                  {stationData?.source || 'OpenAQ'}
                </div>

                <div className="reading-main">
                  <span>PM2.5</span>
                  <b>
                    {pm25 ? pm25.value : '—'}
                    <small> {pm25?.unit || 'No data'}</small>
                  </b>
                </div>

                <div className="reading-pair">
                  <div>
                    <span>PM10</span>
                    <b>
                      {pm10 ? pm10.value : '—'}
                      <small> {pm10?.unit || ''}</small>
                    </b>
                  </div>

                  <div>
                    <span>AQI</span>
                    <b>Unavailable</b>
                  </div>
                </div>

                <div className="precaution">
                  <div>
                    <ShieldCheck size={16} />
                    <b>AQI calculation status</b>
                  </div>
                  <p>
                    An official CPCB AQI has not been calculated.
                    Historical averaging data and pollutant validation
                    are required before reporting an AQI.
                  </p>
                </div>
              </div>

              <div className="section-heading compact">
                <div>
                  <div className="eyebrow">02 / POLLUTANT MEASUREMENTS</div>
                  <h2>Current sensor readings</h2>
                  <p>Values returned by the monitoring station.</p>
                </div>
              </div>

              <div className="location-list">
                {pollutionData.map(item => (
                  <MetricCard
                    key={item.id}
                    reading={item.reading}
                    name={item.name}
                    description={item.description}
                    icon={item.icon}
                  />
                ))}
              </div>

              <div className="section-heading compact">
                <div>
                  <div className="eyebrow">03 / WEATHER CONDITIONS</div>
                  <h2>Local environmental readings</h2>
                </div>
              </div>

              <div className="location-list">
                {weatherData.map(item => (
                  <MetricCard
                    key={item.id}
                    reading={item.reading}
                    name={item.name}
                    description="Station weather sensor"
                    icon={item.icon}
                  />
                ))}
              </div>

              <section className="section-block">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">04 / LOCATION</div>
                    <h2>Monitoring station map</h2>
                    <p>Kadri, Mangaluru</p>
                  </div>
                </div>

                <MapView />
              </section>
            </>
          )}
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <div className="eyebrow">05 / DATA QUALITY</div>
              <h2>Data freshness</h2>
              <p>Reading validation and update information.</p>
            </div>
          </div>

          <div className="summary-strip">
            <div>
              <span className="summary-label">CURRENT</span>
              <b>{currentCount}</b>
            </div>

            <div>
              <span className="summary-label">STALE</span>
              <b>{staleCount}</b>
            </div>

            <div>
              <span className="summary-label">INVALID</span>
              <b>{invalidCount}</b>
            </div>

            <div>
              <span className="summary-label">FILTER WINDOW</span>
              <b>24h</b>
            </div>
          </div>

          <div className="source-type">
            <Database size={15} />
            API fetched: {formatTime(stationData?.fetchedAt)}
          </div>

          <div className="source-type">
            <Clock size={15} />
            Latest sensor measurement: {formatTime(latestReading?.time)}
          </div>

          <div className="source-type">
            <CheckCircle2 size={15} />
            Last successful browser fetch: {formatTime(lastFetch)}
          </div>
        </section>

        <footer className="page-footer">
          <span>AIRMESH · MANGALURU AIR MONITORING</span>
          <span>REAL SENSOR DATA · CPCB VIA OPENAQ</span>
        </footer>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-symbol">
            <span />
            <span />
            <span />
          </div>
          <div className="brand-name">AirMesh</div>
        </div>

        <div className="brand-caption">
          AIR POLLUTION INTELLIGENCE
        </div>

        <div className="side-divider" />

        <div className="side-label">WORKSPACE</div>

        <div className="workspace-chip">
          <span className="workspace-dot" />
          Mangaluru monitoring
        </div>

        <div className="side-label nav-heading">MONITORING</div>

        <nav className="side-nav">
          {navItems.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-link ${
                activeTab === name ? 'active' : ''
              }`}
              onClick={() => setActiveTab(name)}
            >
              <Icon size={17} />
              <span>{name}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="demo-state">
            <span className="demo-dot" />
            <div>
              <b>Live data connection</b>
              <small>CPCB via OpenAQ</small>
            </div>
          </div>

          <div className="side-foot">
            AIR QUALITY IS LOCAL.<br />
            POLLUTION IS NOT.
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>AirMesh</span>
            <b>/</b>
            {activeTab}
          </div>

          <div className="topbar-actions">
            <span className="updated-time">
              {status === 'available'
                ? 'LIVE SENSOR DATA'
                : status.toUpperCase()}
            </span>

            <button
              className="icon-action"
              onClick={fetchData}
              disabled={refreshing}
              title="Refresh sensor data"
            >
              <RefreshCw
                size={17}
                className={refreshing ? 'spin' : ''}
              />
            </button>
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  );
}

export default App;
