'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const HEALTH = {
  VERY_GOOD: { label: 'Bardzo dobra', color: '#159447' },
  WATCH: { label: 'Do obserwacji', color: '#d5a600' },
  AT_RISK: { label: 'Zagrożona', color: '#f07c00' },
  UNPROFITABLE: { label: 'Nierentowna', color: '#d9343a' },
  NO_DATA: { label: 'Brak danych', color: '#7b8794' }
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  return `${Number(value || 0).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} zł`;
}

function markerIcon(L, color) {
  return L.divIcon({
    className: 'company-map-marker-wrap',
    html: `<span class="company-map-marker" style="background:${color}"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
}

export default function CompanyMap({ companies = [], rows = [], onOpenCompany }) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState('');

  const rowsByCompanyId = useMemo(() => {
    return new Map((rows || []).map(row => [row.id, row]));
  }, [rows]);

  const mappedCompanies = useMemo(() => {
    return (companies || []).filter(company => {
      const lat = Number(company.latitude);
      const lng = Number(company.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng);
    });
  }, [companies]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const leafletModule = await import('leaflet');
        const L = leafletModule.default || leafletModule;
        if (cancelled || !mapElementRef.current || mapRef.current) return;

        const map = L.map(mapElementRef.current, {
          center: [52.0693, 19.4803],
          zoom: 6,
          minZoom: 5,
          maxZoom: 18,
          zoomControl: true
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
        setReady(true);
      } catch (error) {
        console.error(error);
        setMapError('Nie udało się uruchomić mapy. Sprawdź połączenie z internetem i ponów próbę.');
      }
    }

    init();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current) return;

    async function renderMarkers() {
      const leafletModule = await import('leaflet');
      const L = leafletModule.default || leafletModule;
      const layer = layerRef.current;
      layer.clearLayers();
      const bounds = [];

      mappedCompanies.forEach(company => {
        const row = rowsByCompanyId.get(company.id) || {};
        const healthKey = row.health?.key || 'NO_DATA';
        const health = HEALTH[healthKey] || HEALTH.NO_DATA;
        const lat = Number(company.latitude);
        const lng = Number(company.longitude);
        bounds.push([lat, lng]);

        const popup = `
          <div class="company-map-popup">
            <strong>${escapeHtml(company.name)}</strong>
            <div>${escapeHtml(company.address || 'Brak adresu')}</div>
            <div style="margin-top:6px"><b>Ocena:</b> ${escapeHtml(health.label)}</div>
            <div><b>Opiekun:</b> ${escapeHtml(company.assignedUser?.name || 'Nie przypisano')}</div>
            <div><b>Przychód:</b> ${escapeHtml(money(row.netTotal))}</div>
            <div><b>Zysk:</b> ${escapeHtml(money(row.profit))}</div>
            <div><b>Stawka:</b> ${escapeHtml(`${Number(row.rate || 0).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} zł/h`)}</div>
            <div class="company-map-popup-actions">
              <button type="button" data-company-id="${escapeHtml(company.id)}">Otwórz kartę firmy</button>
              <a target="_blank" rel="noreferrer" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}">Wyznacz trasę</a>
            </div>
          </div>`;

        const marker = L.marker([lat, lng], { icon: markerIcon(L, health.color) })
          .bindPopup(popup, { maxWidth: 330 })
          .addTo(layer);

        marker.on('popupopen', event => {
          const root = event.popup.getElement();
          const button = root?.querySelector('[data-company-id]');
          if (button) button.onclick = () => onOpenCompany?.(company.id);
        });
      });

      if (bounds.length === 1) mapRef.current.setView(bounds[0], 12);
      else if (bounds.length > 1) mapRef.current.fitBounds(bounds, { padding: [35, 35], maxZoom: 11 });
      else mapRef.current.setView([52.0693, 19.4803], 6);

      setTimeout(() => mapRef.current?.invalidateSize(), 50);
    }

    renderMarkers();
  }, [ready, mappedCompanies, rowsByCompanyId, onOpenCompany]);

  return (
    <div className="company-map-card">
      <div className="company-map-head">
        <div>
          <h2>Mapa firm w Polsce</h2>
          <p className="muted">Mapa pokazuje firmy, które mają zapisane współrzędne geograficzne. Kolor pinezki odpowiada aktualnej ocenie rentowności.</p>
        </div>
        <div className="company-map-counter">Na mapie: <b>{mappedCompanies.length}</b> / {companies.length}</div>
      </div>

      <div className="company-map-legend">
        {Object.entries(HEALTH).map(([key, item]) => (
          <span key={key}><i style={{ background: item.color }} />{item.label}</span>
        ))}
      </div>

      {mapError && <div className="warnBox">{mapError}</div>}
      <div ref={mapElementRef} className="company-map" aria-label="Interaktywna mapa firm" />

      {mappedCompanies.length === 0 && (
        <div className="company-map-empty">
          Brak firm ze współrzędnymi. Uzupełnij szerokość i długość geograficzną w karcie firmy. Automatyczne wyszukiwanie adresów i geokodowanie dodamy w kolejnym etapie.
        </div>
      )}
    </div>
  );
}
