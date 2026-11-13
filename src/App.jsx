
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';

import {
  Activity, AlertCircle, AlertTriangle, ArrowUpRight,
  CheckCircle2, ChevronDown, Clock, Cloud, Database,
  Droplets, Gauge, HeartPulse, Info, Leaf, Mail,
  MapPin, Menu, Radio, RefreshCw, ShieldCheck,
  Thermometer, Wind, X, Save, Bell, Settings
} from 'lucide-react';

import './alerts.css';

const API_URL = '/api/air-quality';
const REFRESH_INTERVAL = 5 * 60 * 1000;

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

const NAV_ITEMS = [
  { name: 'Overview', icon: Gauge },
  { name: 'Pollutants', icon: Activity },
  { name: 'Station', icon: MapPin },
  { name: 'Health guidance', icon: HeartPulse },
  { name: 'Email alerts', icon: Mail }
];

const POLLUTANT_UNITS = {
  pm25: 'µg/m³',
  pm10: 'µg/m³',
  o3: 'µg/m³',
  no2: 'ppb',
  so2: 'ppb',
  co: 'ppb',
  no: 'ppb',
  nox: 'ppb'
};

const DEFAULT_THRESHOLDS = {
  pm25: '15',
  pm10: '',
  o3: '',
  no2: '',
  so2: '',
  co: '',
  no: '',
  nox: ''
};

function formatTime(value) {
  if (!value) return 'Unavailable';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unavailable';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getReading(readings, parameter) {
  return readings.find(
    item => item.parameter?.toLowerCase() === parameter
  );
}

function getAge(timestamp) {
  if (!timestamp) return null;

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 60000)
  );
}

function getFreshness(minutes) {
  if (minutes === null) return 'Unknown';
  if (minutes < 120) return 'Recent';
  if (minutes < 360) return 'Delayed';
  return 'Old reading';
}

async function readJsonResponse(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error('The server sent a response the page could not read.');
  }
}

function getApiMessage(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (value && typeof value === 'object') {
    if (typeof value.message === 'string' && value.message.trim()) {
      return value.message;
    }

    if (typeof value.error === 'string' && value.error.trim()) {
      return value.error;
    }
  }

  return fallback;
}

function Accordion({ title, subtitle, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`accordion ${open ? 'expanded' : ''}`}>
      <button
        className="accordion-trigger"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
      >
        <span>
          <strong>{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>

        <ChevronDown
          className={open ? 'rotated' : ''}
          size={18}
        />
      </button>

      {open && (
        <div className="accordion-content">
          {children}
        </div>
      )}
    </section>
  );
}

function MapView() {
  const element = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    const container = element.current;

    if (!container || mapRef.current) {
      return;
    }

    let map;

    try {
      map = L.map(container, {
        scrollWheelZoom: false,
        zoomControl: true,
        preferCanvas: true
      }).setView(
        [STATION.lat, STATION.lng],
        14
      );

      mapRef.current = map;

      L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        }
      ).addTo(map);

      const marker = L.marker([
        STATION.lat,
        STATION.lng
      ]).addTo(map);

      marker.bindPopup(`
        <strong>${STATION.name}</strong><br/>
        CPCB monitoring station<br/>
        Data source: OpenAQ
      `);

      const resizeMap = () => {
        if (map && mapRef.current === map) {
          map.invalidateSize({
            animate: false,
            pan: false
          });
        }
      };

      const observer = new ResizeObserver(resizeMap);

      observer.observe(container);

      map.whenReady(() => {
        requestAnimationFrame(() => {
          resizeMap();
        });
      });

      return () => {
        observer.disconnect();

        if (map) {
          map.remove();
        }

        if (mapRef.current === map) {
          mapRef.current = null;
        }
      };
    } catch (error) {
      console.error('AirMesh map initialization failed:', error);

      if (map) {
        map.remove();
      }

      mapRef.current = null;
    }
  }, []);

  return (
    <div
      ref={element}
      className="map-canvas"
      aria-label="Kadri monitoring station map"
    />
  );
}

function App() {
  const [stationData, setStationData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [lastFetch, setLastFetch] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState('Overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState('respiratory_sensitive');
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [selectedPollutants, setSelectedPollutants] = useState(['pm25']);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);

  const [subscribeStatus, setSubscribeStatus] = useState('');
  const [subscribeLoading, setSubscribeLoading] = useState(false);

  const [settingsEmail, setSettingsEmail] = useState('');
  const [settingsRequestStatus, setSettingsRequestStatus] = useState('');
  const [settingsRequestLoading, setSettingsRequestLoading] = useState(false);

  const [manageToken, setManageToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);

    return (
      params.get('manageAlerts') ||
      params.get('alert-settings') ||
      ''
    );
  });

  const [manageLoading, setManageLoading] = useState(false);
  const [manageSaving, setManageSaving] = useState(false);
  const [manageStatus, setManageStatus] = useState('');
  const [manageError, setManageError] = useState('');

  const requestRef = useRef(false);

  const readings = stationData?.readings || [];

  const latestReading = useMemo(() => {
    if (!readings.length) return null;

    return readings.reduce((latest, current) => {
      return new Date(current.time) > new Date(latest.time)
        ? current
        : latest;
    });
  }, [readings]);

  const pm25 = getReading(readings, 'pm25');

  const currentCount =
    stationData?.freshness?.currentReadings ?? readings.length;

  const staleCount =
    stationData?.freshness?.staleReadings ?? 0;

  const invalidCount =
    stationData?.freshness?.invalidReadings ?? 0;

  const sensorAge = getAge(latestReading?.time);
  const freshness = getFreshness(sensorAge);

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
        throw new Error('The station response did not include any readings.');
      }

      setStationData(data);
      setLastFetch(new Date());
      setError('');
      setStatus(data.readings.length ? 'available' : 'unavailable');
    } catch (err) {
      setError(err.message || 'Could not load station data.');
      setStatus('error');
    } finally {
      requestRef.current = false;
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    const timer = setInterval(
      fetchData,
      REFRESH_INTERVAL
    );

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!manageToken) return;

    let cancelled = false;

    const loadSettings = async () => {
      setActiveTab('Email alerts');
      setManageLoading(true);
      setManageError('');
      setManageStatus('');

      try {
        const response = await fetch(
          `/api/manage-alert-settings?token=${encodeURIComponent(manageToken)}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json'
            },
            cache: 'no-store'
          }
        );

        const data = await readJsonResponse(response);

        if (!response.ok) {
          throw new Error(
            getApiMessage(
              data.error,
              'Could not load your settings.'
            )
          );
        }

        if (cancelled) return;

        setProfile(data.profile || 'respiratory_sensitive');
        setAlertsEnabled(data.enabled === true);

        const validPollutants = Array.isArray(data.pollutants)
          ? data.pollutants.filter(id =>
              Object.hasOwn(POLLUTANT_UNITS, id)
            )
          : ['pm25'];

        setSelectedPollutants(validPollutants);

        const nextThresholds = { ...DEFAULT_THRESHOLDS };

        for (const id of validPollutants) {
          const value = data.thresholds?.[id]?.value;

          if (value !== undefined && value !== null) {
            nextThresholds[id] = String(value);
          }
        }

        setThresholds(nextThresholds);

        setManageStatus(
          'Your saved alert settings are ready.'
        );
      } catch (err) {
        if (!cancelled) {
          setManageError(
            err.message || 'Could not load settings.'
          );
        }
      } finally {
        if (!cancelled) {
          setManageLoading(false);
        }
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [manageToken]);

  const buildPreferences = () => {
    const cleanThresholds = {};

    if (selectedPollutants.length === 0) {
      throw new Error('Choose at least one pollutant.');
    }

    for (const id of selectedPollutants) {
      const value = Number(thresholds[id]);

      if (
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 100000
      ) {
        throw new Error(
          `Enter a valid threshold for ${id.toUpperCase()}.`
        );
      }

      cleanThresholds[id] = {
        value,
        unit: POLLUTANT_UNITS[id]
      };
    }

    return {
      profile,
      enabled: alertsEnabled,
      pollutants: selectedPollutants,
      thresholds: cleanThresholds,
      frequency: 'important'
    };
  };

  const handleSubscribe = async event => {
    event.preventDefault();

    setSubscribeStatus('');
    setSubscribeLoading(true);

    try {
      const preferences = buildPreferences();

      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          email,
          ...preferences,
          preferences
        })
      });

      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(
          getApiMessage(
            data.error || data.message,
            `Subscription failed (${response.status}).`
          )
        );
      }

      setSubscribeStatus(
        getApiMessage(
          data.message,
          'Check your inbox for the confirmation email.'
        )
      );

      setEmail('');
    } catch (err) {
      setSubscribeStatus(
        err.message || 'Could not start your subscription.'
      );
    } finally {
      setSubscribeLoading(false);
    }
  };

  const handleRequestSettings = async event => {
    event.preventDefault();

    setSettingsRequestStatus('');
    setSettingsRequestLoading(true);

    try {
      const response = await fetch('/api/request-alert-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          email: settingsEmail
        })
      });

      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(
          getApiMessage(
            data.error || data.message,
            'Could not request a settings link.'
          )
        );
      }

      setSettingsRequestStatus(
        getApiMessage(
          data.message,
          'If this email has a verified subscription, we will send a settings link.'
        )
      );

      setSettingsEmail('');
    } catch (err) {
      setSettingsRequestStatus(
        err.message || 'Could not request a settings link.'
      );
    } finally {
      setSettingsRequestLoading(false);
    }
  };

  const handleSaveSettings = async event => {
    event.preventDefault();

    setManageStatus('');
    setManageError('');
    setManageSaving(true);

    try {
      const preferences = buildPreferences();

      const response = await fetch('/api/manage-alert-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          token: manageToken,
          ...preferences
        })
      });

      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(
          getApiMessage(
            data.error,
            'Could not save your alert settings.'
          )
        );
      }

      setManageStatus(
        getApiMessage(
          data.message,
          'Your alert settings have been saved.'
        )
      );
    } catch (err) {
      setManageError(
        err.message || 'Could not save settings.'
      );
    } finally {
      setManageSaving(false);
    }
  };

  const closeManageSettings = () => {
    setManageToken('');
    setManageStatus('');
    setManageError('');

    const url = new URL(window.location.href);

    url.searchParams.delete('manageAlerts');
    url.searchParams.delete('alert-settings');

    window.history.replaceState({}, '', url);

    setActiveTab('Email alerts');
  };

  const togglePollutant = id => {
    setSelectedPollutants(current => (
      current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id]
    ));
  };

  const changeTab = name => {
    setActiveTab(name);
    setSidebarOpen(false);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const renderPollutantGrid = items => (
    <div className="pollutant-grid">
      {items.map(item => {
        const reading = getReading(readings, item.id);
        const Icon = item.icon;

        return (
          <article className="pollutant-item" key={item.id}>
            <span className="pollutant-icon">
              <Icon size={18} />
            </span>

            <div className="pollutant-copy">
              <strong>{item.name}</strong>
              <small>{item.description}</small>
            </div>

            <div className="pollutant-value">
              <strong>
                {reading ? reading.value : '—'}
              </strong>
              <small>
                {reading?.unit || 'No data'}
              </small>
            </div>
          </article>
        );
      })}
    </div>
  );

  const renderOverview = () => (
    <div className="page-content">
      <section className="hero">
        <div className="hero-atmosphere" />

        <div className="hero-topline">
          <span className="hero-kicker">
            <span className="live-dot" />
            AIR QUALITY IN MANGALURU
          </span>

          <span className="hero-location">
            <MapPin size={14} />
            {STATION.city}, {STATION.state}
          </span>
        </div>

        <div className="hero-main">
          <div className="hero-copy">
            <span className="hero-overline">
              AIR QUALITY READINGS FROM KADRI
            </span>

            <h1>
              Know the air<br />
              <span>around you.</span>
            </h1>

            <p>
              See the latest readings from the Kadri station and check when they were recorded.
            </p>

            <button
              className="hero-link"
              onClick={() => changeTab('Pollutants')}
            >
              View pollutant readings <ArrowUpRight size={16} />
            </button>
          </div>

          <div className="hero-reading">
            <div className="reading-heading">
              <span className="reading-indicator" />
              LATEST PM2.5 READING
            </div>

            <div className="hero-reading-number">
              {pm25 ? pm25.value : '--'}
              <span>{pm25?.unit || 'µg/m³'}</span>
            </div>

            <div className="reading-meta">
              <span>Station reading</span>
              <span className={`freshness-label ${freshness.toLowerCase().replace(' ', '-')}`}>
                {freshness}
              </span>
            </div>

            <div className="reading-timestamp">
              <Clock size={13} />
              {pm25
                ? formatTime(pm25.time)
                : 'No PM2.5 reading available'}
            </div>
          </div>
        </div>

        <div className="hero-footer">
          <span>
            <Radio size={14} />
            {stationData?.provider || 'CPCB'} / {stationData?.source || 'OpenAQ'}
          </span>

          <span>
            {latestReading
              ? `Latest station reading: ${formatTime(latestReading.time)}`
              : 'Waiting for station data'}
          </span>
        </div>
      </section>

      <section className="quick-stats">
        <div className="quick-stat">
          <span className="stat-icon">
            <MapPin size={17} />
          </span>
          <div>
            <small>MONITORING STATIONS</small>
            <strong>01</strong>
          </div>
        </div>

        <div className="quick-stat">
          <span className="stat-icon">
            <Activity size={17} />
          </span>
          <div>
            <small>AVAILABLE READINGS</small>
            <strong>{currentCount}</strong>
          </div>
        </div>

        <div className="quick-stat">
          <span className="stat-icon">
            <Clock size={17} />
          </span>
          <div>
            <small>LAST STATION UPDATE</small>
            <strong className="stat-time">
              {latestReading
                ? formatTime(latestReading.time)
                : 'Unavailable'}
            </strong>
          </div>
        </div>

        <div className="quick-stat">
          <span className="stat-icon">
            <Database size={17} />
          </span>
          <div>
            <small>DATA PROVIDER</small>
            <strong>CPCB / OpenAQ</strong>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">01 / LIVE MONITORING</span>
            <h2>Readings from the Kadri station</h2>
            <p>{STATION.name}</p>
          </div>

          <button
            className="outline-button"
            onClick={fetchData}
            disabled={refreshing}
          >
            <RefreshCw
              size={14}
              className={refreshing ? 'spin' : ''}
            />
            {refreshing ? 'Updating' : 'Refresh data'}
          </button>
        </div>

        {status === 'loading' && (
          <div className="notice-card">
            <RefreshCw className="spin" size={18} />
            Loading station readings...
          </div>
        )}

        {status === 'error' && (
          <div className="notice-card error-card">
            <AlertCircle size={20} />
            <div>
              <strong>Could not load station readings</strong>
              <p>{error}</p>
              <button className="text-button" onClick={fetchData}>
                Try again
              </button>
            </div>
          </div>
        )}

        {status === 'unavailable' && (
          <div className="notice-card">
            <AlertTriangle size={20} />
            No recent readings are available from this station.
          </div>
        )}

        {status === 'available' && (
          <>
            <div className="measurement-feature">
              <div className="measurement-feature-top">
                <div>
                  <span className="eyebrow">FINE PARTICLES</span>
                  <h3>PM2.5 level</h3>
                </div>

                <span className="measurement-icon">
                  <Cloud size={24} />
                </span>
              </div>

              <div className="measurement-number">
                <strong>{pm25 ? pm25.value : '--'}</strong>
                <span>{pm25?.unit || 'µg/m³'}</span>
              </div>

              <div className="measurement-bottom">
                <span>Value reported by the station</span>
                <span>
                  {pm25
                    ? formatTime(pm25.time)
                    : 'No PM2.5 reading'}
                </span>
              </div>
            </div>

            <div className="info-note">
              <Info size={18} />
              <p>
                This page shows the PM2.5 reading. It does not show the official CPCB AQI, which is calculated using multiple pollutants and set averaging periods.
              </p>
            </div>

            <Accordion
              title="Other pollutant measurements"
              subtitle="Open to see the readings"
            >
              {renderPollutantGrid(POLLUTANTS)}
            </Accordion>

            <Accordion
              title="Weather readings"
              subtitle="Temperature, humidity and wind"
            >
              {renderPollutantGrid(WEATHER)}
            </Accordion>
          </>
        )}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">02 / STATION LOCATION</span>
            <h2>Where was this reading recorded?</h2>
            <p>See the location of the monitoring station.</p>
          </div>

          <span className="small-tag">01 STATION</span>
        </div>

        <div className="map-panel">
          <div className="map-heading">
            <div>
              <strong>{STATION.name}</strong>
              <small>{STATION.city}, {STATION.state}</small>
            </div>

            <span className="map-status">
              <span className="live-dot" />
              STATION LOCATION
            </span>
          </div>

          <MapView />

          <div className="map-footer">
            <span>
              <MapPin size={13} />
              {STATION.lat}, {STATION.lng}
            </span>
            <span>Map data © OpenStreetMap</span>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">03 / ABOUT THE DATA</span>
            <h2>Where the readings come from</h2>
            <p>When readings were recorded and where they came from.</p>
          </div>
        </div>

        <Accordion
          title="Reading times and data checks"
          subtitle="See how many readings are current, old or invalid"
        >
          <div className="quality-grid">
            <div><small>CURRENT</small><strong>{currentCount}</strong></div>
            <div><small>STALE</small><strong>{staleCount}</strong></div>
            <div><small>INVALID</small><strong>{invalidCount}</strong></div>
            <div><small>MAXIMUM AGE</small><strong>24h</strong></div>
          </div>

          <div className="metadata-list">
            <div>
              <span>Data received</span>
              <strong>{formatTime(stationData?.fetchedAt)}</strong>
            </div>
            <div>
              <span>Latest measurement</span>
              <strong>{formatTime(latestReading?.time)}</strong>
            </div>
            <div>
              <span>Last page update</span>
              <strong>{formatTime(lastFetch)}</strong>
            </div>
            <div>
              <span>Provider</span>
              <strong>{stationData?.provider || 'Unavailable'}</strong>
            </div>
            <div>
              <span>Source</span>
              <strong>{stationData?.source || 'Unavailable'}</strong>
            </div>
          </div>
        </Accordion>
      </section>

      <section className="cta-panel">
        <div className="cta-icon">
          <HeartPulse size={23} />
        </div>

        <div>
          <span className="eyebrow">HEALTH GUIDANCE</span>
          <h2>Get air-quality readings by email.</h2>
          <p>
            Read general guidance and learn what the station measurements can tell you.
          </p>
        </div>

        <button
          className="solid-button"
          onClick={() => changeTab('Health guidance')}
        >
          Health guidance <ArrowUpRight size={16} />
        </button>
      </section>

      <footer className="page-footer">
        <span>AIRMESH / KADRI STATION</span>
        <span>STATION DATA / CPCB VIA OPENAQ</span>
      </footer>
    </div>
  );

  const renderPollutants = () => (
    <div className="page-content">
      <section className="page-title">
        <span className="eyebrow">POLLUTANT READINGS</span>
        <h1>Pollutant readings</h1>
        <p>
          Measurements reported by the Kadri station. Values use the units provided by the data source.
        </p>
      </section>

      <div className="measurement-summary">
        <div>
          <span className="eyebrow">READINGS AVAILABLE</span>
          <strong>{currentCount}</strong>
          <small>Readings available</small>
        </div>

        <div>
          <span className="eyebrow">LAST STATION UPDATE</span>
          <strong className="summary-time">
            {latestReading
              ? formatTime(latestReading.time)
              : 'Unavailable'}
          </strong>
          <small>{freshness}</small>
        </div>
      </div>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">01 / AIR POLLUTANTS</span>
            <h2>Pollutant measurements</h2>
            <p>Explore the available pollutant readings.</p>
          </div>
        </div>

        {renderPollutantGrid(POLLUTANTS)}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">02 / ENVIRONMENT</span>
            <h2>Weather measurements</h2>
            <p>Additional environmental readings from the station.</p>
          </div>
        </div>

        {renderPollutantGrid(WEATHER)}
      </section>

      <div className="info-note">
        <Info size={18} />
        <p>
          Missing readings are not treated as zero. Measurements use
          the units supplied by OpenAQ. This page does not calculate
          an official CPCB AQI.
        </p>
      </div>
    </div>
  );

  const renderStation = () => (
    <div className="page-content">
      <section className="page-title">
        <span className="eyebrow">MONITORING STATION</span>
        <h1>One station in Kadri</h1>
        <p>
          AirMesh currently uses readings from this monitoring station.
        </p>
      </section>

      <div className="station-detail-card">
        <div className="station-card-heading">
          <span className="station-symbol">
            <MapPin size={23} />
          </span>
          <span className="eyebrow">REGISTERED STATION LOCATION</span>
        </div>

        <h2>{stationData?.station || STATION.name}</h2>
        <p>{STATION.city}, {STATION.state}, India</p>

        <div className="quality-grid">
          <div>
            <small>PROVIDER</small>
            <strong>{stationData?.provider || 'CPCB'}</strong>
          </div>
          <div>
            <small>DATA SOURCE</small>
            <strong>{stationData?.source || 'OpenAQ'}</strong>
          </div>
          <div>
            <small>CURRENT</small>
            <strong>{currentCount}</strong>
          </div>
          <div>
            <small>STALE</small>
            <strong>{staleCount}</strong>
          </div>
        </div>

        <Accordion title="Station data">
          <div className="metadata-list">
            <div>
              <span>Invalid readings</span>
              <strong>{invalidCount}</strong>
            </div>
            <div>
              <span>Maximum reading age</span>
              <strong>{stationData?.freshness?.maximumAgeHours ?? 24} hours</strong>
            </div>
            <div>
              <span>Coordinates</span>
              <strong>{STATION.lat}, {STATION.lng}</strong>
            </div>
            <div>
              <span>Latest sensor reading</span>
              <strong>{formatTime(latestReading?.time)}</strong>
            </div>
            <div>
              <span>Data received</span>
              <strong>{formatTime(stationData?.fetchedAt)}</strong>
            </div>
          </div>
        </Accordion>
      </div>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LOCATION</span>
            <h2>Kadri, Mangaluru</h2>
            <p>Location of the station that reports these readings.</p>
          </div>
        </div>

        <div className="map-panel">
          <div className="map-heading">
            <div>
              <strong>{STATION.name}</strong>
              <small>{STATION.city}, {STATION.state}</small>
            </div>
            <span className="map-status">
              <span className="live-dot" />
              STATION LOCATION
            </span>
          </div>

          <MapView />

          <div className="map-footer">
            <span>
              <MapPin size={13} />
              {STATION.lat}, {STATION.lng}
            </span>
            <span>Map data © OpenStreetMap</span>
          </div>
        </div>
      </section>
    </div>
  );

  const renderGuidance = () => (
    <div className="page-content">
      <section className="page-title">
        <span className="eyebrow">AIR QUALITY AND HEALTH</span>
        <h1>Air quality and your health</h1>
        <p>
          General information about air-quality readings. This page is for education and is not medical advice.
        </p>
      </section>

      <div className="guidance-intro">
        <div className="guidance-intro-icon">
          <Leaf size={25} />
        </div>

        <div>
          <span className="eyebrow">BASIC INFORMATION</span>
          <h2>Air pollution does not affect everyone in the same way.</h2>
          <p>
            Children, older adults, and people with heart or lung conditions may be more sensitive to air pollution. Responses vary from person to person.
          </p>
        </div>
      </div>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">01 / ABOUT PM2.5</span>
            <h2>What PM2.5 means</h2>
            <p>A short explanation of this reading.</p>
          </div>
        </div>

        <div className="guidance-grid">
          <article className="guidance-card">
            <span className="guidance-card-icon">
              <Cloud size={20} />
            </span>
            <h3>Small airborne particles</h3>
            <p>
              PM2.5 measures airborne particles that are 2.5 micrometres wide or smaller. They can travel deep into the lungs.
            </p>
          </article>

          <article className="guidance-card">
            <span className="guidance-card-icon">
              <HeartPulse size={20} />
            </span>
            <h3>Different health needs</h3>
            <p>
              Some people are more affected by air pollution than others. Follow advice from your healthcare professional.
            </p>
          </article>

          <article className="guidance-card">
            <span className="guidance-card-icon">
              <Clock size={20} />
            </span>
            <h3>Check when it was recorded</h3>
            <p>
              Check the timestamp. An older reading may not reflect current outdoor conditions.
            </p>
          </article>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">02 / CHECKING THE READINGS</span>
            <h2>A few things to keep in mind</h2>
            <p>Keep these points in mind when checking the readings.</p>
          </div>
        </div>

        <div className="guidance-list">
          <div>
            <span>01</span>
            <section>
              <strong>Check the timestamp</strong>
              <p>
                Look at the sensor measurement time, not just
                when the website refreshed.
              </p>
            </section>
          </div>

          <div>
            <span>02</span>
            <section>
              <strong>Check other pollutants too</strong>
              <p>
                Pollutants come from different sources and can affect health in different ways.
              </p>
            </section>
          </div>

          <div>
            <span>03</span>
            <section>
              <strong>Think about nearby sources</strong>
              <p>
                Traffic, construction, weather and indoor sources can all affect the air around you.
              </p>
            </section>
          </div>

          <div>
            <span>04</span>
            <section>
              <strong>Follow medical advice</strong>
              <p>
                If you have a health condition, follow the advice of your healthcare professional.
              </p>
            </section>
          </div>
        </div>
      </section>

      <div className="info-note">
        <Info size={18} />
        <p>
          AirMesh currently shows readings from one station in Kadri, Mangaluru. They may not reflect conditions in other neighbourhoods or indoors. This page does not diagnose or treat health conditions.
        </p>
      </div>
    </div>
  );

  const renderThresholdFields = () => (
    <div className="alert-threshold-list">
      {POLLUTANTS.map(item => {
        const selected = selectedPollutants.includes(item.id);

        return (
          <div
            className={`alert-threshold-row ${selected ? 'selected' : ''}`}
            key={item.id}
          >
            <label className="alert-pollutant-choice">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => togglePollutant(item.id)}
              />

              <span>
                <strong>{item.name}</strong>
                <small>{item.description}</small>
              </span>
            </label>

            <div className="alert-threshold-input">
              <input
                type="number"
                min="0.1"
                step="any"
                value={thresholds[item.id] || ''}
                onChange={event => setThresholds(current => ({
                  ...current,
                  [item.id]: event.target.value
                }))}
                disabled={!selected}
                placeholder="Threshold"
                aria-label={`${item.name} threshold`}
              />

              <span>{POLLUTANT_UNITS[item.id]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderProfileControls = () => (
    <>
      <div className="alert-profile-options">
        <label className={`alert-profile-option ${profile === 'respiratory_sensitive' ? 'active' : ''}`}>
          <input
            type="radio"
            name="alert-profile"
            value="respiratory_sensitive"
            checked={profile === 'respiratory_sensitive'}
            onChange={() => setProfile('respiratory_sensitive')}
          />

          <span className="alert-profile-icon">
            <HeartPulse size={19} />
          </span>

          <span>
            <strong>Respiratory-sensitive</strong>
            <small>
              Starts with a PM2.5 limit of 15 µg/m³. You can change it.
            </small>
          </span>
        </label>

        <label className={`alert-profile-option ${profile === 'general' ? 'active' : ''}`}>
          <input
            type="radio"
            name="alert-profile"
            value="general"
            checked={profile === 'general'}
            onChange={() => setProfile('general')}
          />

          <span className="alert-profile-icon">
            <Bell size={19} />
          </span>

          <span>
            <strong>General updates</strong>
            <small>
              Choose which pollutant readings you want alerts for.
            </small>
          </span>
        </label>

        <label className={`alert-profile-option ${profile === 'custom' ? 'active' : ''}`}>
          <input
            type="radio"
            name="alert-profile"
            value="custom"
            checked={profile === 'custom'}
            onChange={() => setProfile('custom')}
          />

          <span className="alert-profile-icon">
            <Settings size={19} />
          </span>

          <span>
            <strong>Custom profile</strong>
            <small>
              Choose the pollutants and limits you want.
            </small>
          </span>
        </label>
      </div>

      <div className="alert-enable-row">
        <div>
          <strong>Enable daily notifications</strong>
          <small>Switch this off to pause alerts.</small>
        </div>

        <label className="alert-switch">
          <input
            type="checkbox"
            checked={alertsEnabled}
            onChange={event => setAlertsEnabled(event.target.checked)}
          />
          <span />
        </label>
      </div>

      <div className="alert-threshold-heading">
        <div>
          <strong>Pollutant thresholds</strong>
          <small>
            Get an email when a recent reading goes above your chosen limit.
          </small>
        </div>
      </div>

      {renderThresholdFields()}

      <div className="info-note alert-info-note">
        <Info size={18} />
        <p>
          The starting PM2.5 limit of 15 µg/m³ is a reference setting, not a medical limit. You choose the other limits. Each pollutant uses its own unit.
        </p>
      </div>
    </>
  );

  const renderEmail = () => (
    <div className="page-content">
      <section className="page-title">
        <span className="eyebrow">EMAIL ALERTS</span>
        <h1>Get alerts about local readings</h1>
        <p>
          Choose the readings you want to track. AirMesh checks them once a day and emails you when a selected limit is exceeded.
        </p>
      </section>

      {manageToken ? (
        <div className="alert-manage-panel">
          <div className="alert-panel-heading">
            <span className="alert-panel-icon">
              <Settings size={22} />
            </span>

            <div>
              <span className="eyebrow">SETTINGS LINK</span>
              <h2>Update your email alerts</h2>
              <p>
                Change your alert choices or pause notifications.
              </p>
            </div>
          </div>

          {manageLoading ? (
            <div className="notice-card">
              <RefreshCw size={18} className="spin" />
              Loading your saved settings...
            </div>
          ) : manageError && !manageStatus ? (
            <div className="notice-card error-card">
              <AlertCircle size={18} />
              <div>
                <strong>This settings link is not available</strong>
                <p>{manageError}</p>
                <button
                  className="text-button"
                  onClick={closeManageSettings}
                >
                  Back to email alerts
                </button>
              </div>
            </div>
          ) : (
            <form
              className="alert-settings-form"
              onSubmit={handleSaveSettings}
            >
              {renderProfileControls()}

              <button
                className="solid-button alert-save-button"
                type="submit"
                disabled={manageSaving || manageLoading}
              >
                {manageSaving
                  ? 'Saving...'
                  : 'Save notification settings'}
                <Save size={16} />
              </button>

              {manageStatus && (
                <p className="form-message success-message" role="status">
                  {manageStatus}
                </p>
              )}

              {manageError && (
                <p className="form-message error-message" role="alert">
                  {manageError}
                </p>
              )}
            </form>
          )}

          <button
            className="alert-secondary-button"
            onClick={closeManageSettings}
          >
            Close settings
          </button>
        </div>
      ) : (
        <>
          <div className="alert-frequency-banner">
            <span className="alert-frequency-icon">
              <Clock size={20} />
            </span>

            <div>
              <strong>One check each day</strong>
              <p>
                AirMesh checks recent station readings once a day, around 9 AM IST. It does not send instant alerts.
              </p>
            </div>
          </div>

          <div className="email-layout">
            <div className="email-intro">
              <div className="cta-icon">
                <Mail size={24} />
              </div>

              <span className="eyebrow">
                AIR QUALITY EMAILS
              </span>

              <h2>Choose the readings you want to track</h2>

              <p>
                Choose an alert profile and the pollutants you want to track. Verify your email address before alerts can start.
              </p>

              <div className="email-benefit">
                <CheckCircle2 size={17} />
                Verify your email before alerts start
              </div>

              <div className="email-benefit">
                <ShieldCheck size={17} />
                Use a secure link to change your settings
              </div>

              <div className="email-benefit">
                <Clock size={17} />
                Daily checks against your limits
              </div>

              <div className="email-benefit">
                <Info size={17} />
                Alerts are not medical advice
              </div>
            </div>

            <form
              className="email-form alert-subscribe-form"
              onSubmit={handleSubscribe}
            >
              <span className="eyebrow">
                SIGN UP FOR EMAIL ALERTS
              </span>

              <label htmlFor="subscriber-email">
                Email address
              </label>

              <input
                id="subscriber-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                disabled={subscribeLoading}
              />

              <div className="alert-form-divider" />

              <span className="eyebrow">
                ALERT SETTINGS
              </span>

              {renderProfileControls()}

              <button
                className="solid-button alert-save-button"
                type="submit"
                disabled={subscribeLoading}
              >
                {subscribeLoading
                  ? 'Sending confirmation email...'
                  : 'Sign up and verify email'}
                <ArrowUpRight size={16} />
              </button>

              {subscribeStatus && (
                <p className="form-message" role="status">
                  {subscribeStatus}
                </p>
              )}

              <small>
                We will email you a confirmation link. Your alert settings will be saved with your subscription.
              </small>
            </form>
          </div>

          <section className="alert-existing-panel">
            <div>
              <span className="eyebrow">ALREADY SIGNED UP?</span>
              <h2>Change your alert settings</h2>
              <p>
                Enter your email address and we will send a secure link to change your settings or pause alerts.
              </p>
            </div>

            <form
              className="alert-settings-request"
              onSubmit={handleRequestSettings}
            >
              <label htmlFor="settings-email">
                Email address
              </label>

              <div className="alert-request-controls">
                <input
                  id="settings-email"
                  type="email"
                  value={settingsEmail}
                  onChange={event => setSettingsEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={settingsRequestLoading}
                />

                <button
                  className="outline-button"
                  type="submit"
                  disabled={settingsRequestLoading}
                >
                  {settingsRequestLoading
                    ? 'Sending...'
                    : 'Send settings link'}
                  <ArrowUpRight size={15} />
                </button>
              </div>

              {settingsRequestStatus && (
                <p className="form-message" role="status">
                  {settingsRequestStatus}
                </p>
              )}
            </form>
          </section>

          <div className="info-note">
            <Info size={18} />
            <p>
              AirMesh currently checks readings from one station in Kadri, Mangaluru. Alerts are based on that station only and may not reflect other neighbourhoods or indoor air.
            </p>
          </div>
        </>
      )}

      <footer className="page-footer">
        <span>AIRMESH / EMAIL ALERTS</span>
        <span>DAILY CHECK / KADRI STATION</span>
      </footer>
    </div>
  );

  const renderContent = () => {
    if (activeTab === 'Pollutants') {
      return renderPollutants();
    }

    if (activeTab === 'Station') {
      return renderStation();
    }

    if (activeTab === 'Health guidance') {
      return renderGuidance();
    }

    if (activeTab === 'Email alerts') {
      return renderEmail();
    }

    return renderOverview();
  };

  return (
    <><div className="airmesh-content">
        <div className="app-shell">

          {sidebarOpen && (
            <button
              className="mobile-scrim"
              aria-label="Close menu"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
            <div className="brand-row">
              <div className="brand-symbol">
                <span />
                <span />
                <span />
              </div>

              <div className="brand-name">
                AirMesh<span>.</span>
              </div>

              <button
                className="mobile-close"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <div className="brand-caption">
              AIR QUALITY MONITORING
            </div>

            <div className="side-divider" />

            <div className="side-label">LOCATION</div>

            <div className="workspace-chip">
              <span className="workspace-dot" />
              <span>Mangaluru, Karnataka</span>
            </div>

            <div className="side-label nav-heading">
              NAVIGATION
            </div>

            <nav className="side-nav">
              {NAV_ITEMS.map(({ name, icon: Icon }) => (
                <button
                  key={name}
                  className={`nav-link ${activeTab === name ? 'active' : ''}`}
                  onClick={() => changeTab(name)}
                >
                  <Icon size={17} />
                  <span>{name}</span>
                </button>
              ))}
            </nav>

            <div className="sidebar-bottom">
              <div className="demo-state">
                <span
                  className={`demo-dot ${status === 'available' ? 'connected' : ''}`}
                />

                <div>
                  <b>
                    {status === 'available'
                      ? 'Data available'
                      : status === 'loading'
                        ? 'Connecting...'
                        : 'Data unavailable'}
                  </b>

                  <small>CPCB via OpenAQ</small>
                </div>
              </div>

              <div className="side-foot">
                AIR QUALITY VARIES BY LOCATION.
                <br />
                CHECK THE LOCAL READINGS.
              </div>
            </div>
          </aside>

          <main className="main-area">
            <header className="topbar">
              <div className="topbar-left">
                <button
                  className="mobile-menu"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open menu"
                >
                  <Menu size={19} />
                </button>

                <div className="breadcrumb">
                  <span>AirMesh</span>
                  <b>/</b>
                  {activeTab}
                </div>
              </div>

              <div className="topbar-actions">
                <span className={`connection-status ${status}`}>
                  <span />
                  {status === 'available'
                    ? 'DATA AVAILABLE'
                    : status.toUpperCase()}
                </span>

                <button
                  className="icon-action"
                  onClick={fetchData}
                  disabled={refreshing}
                  title="Refresh station data"
                  aria-label="Refresh station data"
                >
                  <RefreshCw
                    size={16}
                    className={refreshing ? 'spin' : ''}
                  />
                </button>
              </div>
            </header>

            {renderContent()}
          </main>

          <nav className="mobile-bottom-nav">
            {NAV_ITEMS.map(({ name, icon: Icon }) => (
              <button
                key={name}
                className={activeTab === name ? 'active' : ''}
                onClick={() => changeTab(name)}
              >
                <Icon size={18} />

                <span>
                  {name === 'Health guidance'
                    ? 'Health'
                    : name === 'Email alerts'
                      ? 'Alerts'
                      : name}
                </span>
              </button>
            ))}
          </nav>

        </div>
      </div>
    </>
  );
}

export default App;
